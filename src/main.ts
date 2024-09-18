import "./style.css";

import {
    KeyCode,
    KeyEvent,
    Note,
    NoteBody,
    UserNote,
    State,
    Action,
    Score,
    Multiplier,
} from "./types";
import { GameSettings, ReactionThreshold } from "./constants";
import {
    Tick,
    AutoPlayNote,
    UserPlaysNote,
    Animate,
    MissedNoteScore,
    PlayRandNote,
    UserPlayTailNote,
    reduceState,
    initialState,
} from "./state";
import {
    convertCsvToNotesArr,
    getLast,
    createNotesStream,
    isUserPlayed,
    not,
    getAssignedUserNotes,
    getKeyToGuitarCol,
    randInstumentData$,
} from "./util";
import { updateView } from "./view";

import {
    Observable,
    fromEvent,
    interval,
    merge,
    Subscription,
    partition,
} from "rxjs";
import {
    map,
    filter,
    scan,
    mergeMap,
    startWith,
    withLatestFrom,
} from "rxjs/operators";
import * as Tone from "tone";
import { SampleLibrary } from "./tonejs-instruments";

/**
 * Main Game function
 */
export function main(
    csvContents: string,
    samples: { [key: string]: Tone.Sampler },
    startTime: number,
) {
    // ==============================================TICK===============================================================
    /*
     * Tick Action Stream
     */
    const tick$: Observable<Action> = interval(GameSettings.TICK_RATE_MS).pipe(
        map((timeElapsed) => new Tick(timeElapsed, gameEndsAt)),
    );

    // ==============================================NOTES===============================================================

    const allNotes: ReadonlyArray<Note> = convertCsvToNotesArr(csvContents);

    const gameEndsAt: number =
        getLast(allNotes)!.end * 1000 + 2 * GameSettings.DELAY;

    // Seperate auto notes and user notes from allNotes
    const autoNotes: ReadonlyArray<Note> = allNotes.filter(not(isUserPlayed));
    const userNotes: ReadonlyArray<UserNote> = getAssignedUserNotes(
        allNotes.filter(isUserPlayed),
    ).filter((n) => !n.body.tail); // filter out tail notes; tail notes have their own stream

    // Auto Notes Play Stream
    const autoNotes$: Observable<Note> = createNotesStream<Note>(autoNotes)(
        (autNote) => autNote.start,
    )(GameSettings.DELAY); // set the dalay amt at 2 secs

    /*
     * User Notes Play Action Stream
     */
    const userNotes$: Observable<UserNote> = createNotesStream<UserNote>(
        userNotes,
    )((userNote) => userNote.note.start)(GameSettings.DELAY); // set the dalay amt at 2 secs

    /*
     * Auto Notes Play Action Stream
     */
    const autoNotesPlay$: Observable<Action> = autoNotes$.pipe(
        map((note: Note) => new AutoPlayNote(note)),
    );

    // ==============================================ANIMATION==============================================================

    const allUserNotes = getAssignedUserNotes(allNotes.filter(isUserPlayed));

    const notesToAnimate$: Observable<UserNote> = createNotesStream<UserNote>(
        allUserNotes,
    )((userNote) => userNote.note.start)(0); // set the delay at 0 secs
    // This means animation of notes start as soons as the game starts
    // As it takes exactly 2 seconds to travel down the columns, when the note reaches at the bottom,
    // the correct states will be outputed by the userNotes$ stream so it is perfectly aligned

    /*
     * Animate Notes Action Stream
     */
    const animate$: Observable<Action> = notesToAnimate$.pipe(
        map((userNote: UserNote) => new Animate(userNote)),
    );

    // ==============================================USER INTERACTION==============================================================

    // User input stream
    const keyPress$: Observable<KeyboardEvent> = fromEvent<KeyboardEvent>(
        document,
        "keypress",
    ).pipe(
        filter(({ code }) => ["KeyH", "KeyJ", "KeyK", "KeyL"].includes(code)),
        filter(({ repeat }) => !repeat),
        startWith({} as KeyboardEvent),
    );

    // Accumulate all keyPress events in an array that are pressed almost simultaneously
    const accumulatedKeyPress$ = keyPress$.pipe(
        scan((acc, keyPress) => {
            if (
                acc.length >= 1 &&
                acc[0].timeStamp - keyPress.timeStamp >= -ReactionThreshold
            ) {
                return [...acc, keyPress];
            } else {
                return [keyPress];
            }
        }, [] as KeyboardEvent[]),
    );

    // Accumulate all usernotes into an array if multiple notes have the same start time
    const accumulatedUserNotes$ = userNotes$.pipe(
        scan((acc, userNote) => {
            // If the array is empty or the start time is the same, add the note
            if (acc.length === 0 || acc[0].note.start === userNote.note.start) {
                return [...acc, userNote];
            } else {
                // If the start time is different, reset the array with the new note
                return [userNote];
            }
        }, [] as UserNote[]),
    );

    // Initially, I was using switchmap(), then switched to combineLatest(), but I was facing an issue:
    // when the user is trying to play multiple notes at the same time, only 1 note plays.
    // To fix this, accumulating the user key presses and same time notes, allows us to play all notes

    // Partition the notes that are played and the notes that were NOT tried to play, simply missed
    const [userPressNote$, allMissedNotes$] = partition(
        accumulatedUserNotes$.pipe(
            withLatestFrom(accumulatedKeyPress$), // get the latest key pressess
            map(([userNotes, keyPresses]) => {
                // Create an array to store notes that match the key presses
                const matchedNotes = userNotes.filter((userNote) => {
                    // key press time needs to be aligned witht the notes,
                    // so time = key pressed timeStamp - time when game started - Delay
                    return keyPresses.some((keyPress) => {
                        // at least 1 keypress has to exist to play a note
                        const keyTime =
                            keyPress.timeStamp - startTime - GameSettings.DELAY;
                        const noteTime = userNote.note.start * 1000;
                        const timeDiff = keyTime - noteTime;
                        return (
                            getKeyToGuitarCol(keyPress.code) ===
                                userNote.body.column &&
                            timeDiff <= ReactionThreshold &&
                            timeDiff >= -ReactionThreshold
                        );
                    });
                });
                return matchedNotes;
            }),
        ),
        (matchedNotes) => matchedNotes.length > 0,
    );

    const userPlaysNote$: Observable<Action> = userPressNote$.pipe(
        map((notes) => new UserPlaysNote(getLast(notes)!)),
    );

    // ===================================================MISSED NOTE=====================================================

    const missedScore$ = allMissedNotes$.pipe(
        map((_) => new MissedNoteScore()),
    );

    // ==============================================KEY PRESS NOT ALIGNED==================================================

    /**
     * Missed Note Stream - updated the multiplies and decreases score
     */

    // accumulate all notes
    const accNotes$ = notesToAnimate$.pipe(
        scan((acc, userNote) => {
            return [...acc, userNote];
        }, [] as UserNote[]),
    );

    const keyPressNotAligned$ = accumulatedKeyPress$.pipe(
        withLatestFrom(accNotes$),
        filter(([keyPresses, userNotes]) => {
            return keyPresses.some((k) => {
                // at least 1 keypress needs to be missed
                return userNotes.every((n) => {
                    // for every note that was tried to being played
                    const keyTime =
                        k.timeStamp - startTime - GameSettings.DELAY;
                    const noteTime = n.note.start * 1000;
                    const timeDiff = keyTime - noteTime;

                    const cond1 = !(
                        timeDiff <= ReactionThreshold &&
                        timeDiff >= -ReactionThreshold
                    );
                    const cond2 = n.body.column !== getKeyToGuitarCol(k.code); // if the user presses the key at the right time, but hits the wrong col
                    return cond1 || cond2;
                });
            });
        }),
    );

    /**
     * Rand Note Play Stream on each miss
     */
    const randNotePlay$ = keyPressNotAligned$.pipe(
        withLatestFrom(randInstumentData$), // get data from zipped rng stream in utils
        map(
            ([_, [instrument, velocity, pitch, duration]]) =>
                new PlayRandNote(instrument, velocity, pitch, duration),
        ),
    );

    // ==============================================TAIL NOTES==================================================

    const userTailNotes: ReadonlyArray<UserNote> = getAssignedUserNotes(
        allNotes.filter(isUserPlayed),
    ).filter((n) => n.body.tail); // filter the tail notes

    const userTailNotes$: Observable<UserNote> = createNotesStream<UserNote>(
        userTailNotes,
    )((userNote) => userNote.note.start)(GameSettings.DELAY);

    const accTail$: Observable<UserNote[]> = userTailNotes$.pipe(
        scan((acc, userNote) => {
            return [...acc, userNote]; // so all notes can stop playing
        }, [] as UserNote[]),
    );

    const accOptTails$: Observable<UserNote[]> = userTailNotes$.pipe(
        scan((acc: UserNote[], userNote: UserNote) => {
            if (acc.length === 0 || acc[0].note.start === userNote.note.start) {
                return [...acc, userNote];
            } else {
                return [userNote];
            }
        }, [] as UserNote[]),
    );

    /**
     * A func that creates a stream of keyboard events
     */
    const key$ = (
        eventType: KeyEvent,
        keyCode: KeyCode,
    ): Observable<KeyboardEvent> =>
        fromEvent<KeyboardEvent>(document, eventType).pipe(
            filter((event) => event.code === keyCode),
            filter((event) => !event.repeat),
        );

    /**
     * A func that creates a stream to play tail notes
     */
    const startKeyStreamFor = (keyCode: KeyCode): Observable<Action> => {
        const keyDown$ = key$("keydown", keyCode);

        return accOptTails$.pipe(
            withLatestFrom(keyDown$), // similar pattern as the UserPlayNote stream
            map(
                ([userNotes, keyDown]: [UserNote[], KeyboardEvent]): [
                    UserNote[],
                    KeyboardEvent,
                ] => {
                    const matchedNotes: UserNote[] = userNotes.filter(
                        (userNote: UserNote) => {
                            const keyTime =
                                keyDown.timeStamp -
                                startTime -
                                GameSettings.DELAY;
                            const noteTime = userNote.note.start * 1000;
                            const timeDiff = keyTime - noteTime;

                            return (
                                getKeyToGuitarCol(keyDown.code) ===
                                    userNote.body.column &&
                                timeDiff <= ReactionThreshold &&
                                timeDiff >= -ReactionThreshold
                            );
                        },
                    );
                    return [matchedNotes, keyDown];
                },
            ),
            filter(
                ([notes, keyDown]: [UserNote[], KeyboardEvent]) =>
                    notes.length > 0,
            ),
            map(
                ([notes, keyDown]: [UserNote[], KeyboardEvent]): Action =>
                    new UserPlayTailNote(getLast(notes)!, true), // true to start playing tail note
            ),
        );
    };

    /**
     * A func that creates a stream to stop tail notes
     */
    const stopKeyStreamFor = (keyCode: KeyCode): Observable<Action> => {
        const keyUp$ = key$("keyup", keyCode);

        return keyUp$.pipe(
            withLatestFrom(accOptTails$),
            map(
                ([keyUp, userNotes]: [KeyboardEvent, UserNote[]]): [
                    UserNote[],
                    KeyboardEvent,
                ] => {
                    const matchingUserNotes = userNotes.filter(
                        (userNote) =>
                            getKeyToGuitarCol(keyUp.code) ===
                            userNote.body.column,
                    );

                    // matchingUserNotes will be an array of all matching user notes
                    return [matchingUserNotes, keyUp];
                },
            ),
            // stop playing all notes that are trying to be stopped
            mergeMap(([userNotes, keyDown]: [UserNote[], KeyboardEvent]) =>
                userNotes.map(
                    (userNote) => new UserPlayTailNote(userNote, false), // false to stop playing tailed note
                ),
            ),
        );
    };

    // All streams for playing tail notes
    // I realised later on that having seperate streams for each key solves the issue of playing 2 notes at the same time
    // I do not need to accumulate key presses like I did to play normal notes by this design
    const startTailNoteKeyH = startKeyStreamFor("KeyH");
    const stopTailNoteKeyH = stopKeyStreamFor("KeyH");

    const startTailNoteKeyJ = startKeyStreamFor("KeyJ");
    const stopTailNoteKeyJ = stopKeyStreamFor("KeyJ");

    const startTailNoteKeyK = startKeyStreamFor("KeyK");
    const stopTailNoteKeyK = stopKeyStreamFor("KeyK");

    const startTailNoteKeyL = startKeyStreamFor("KeyL");
    const stopTailNoteKeyL = stopKeyStreamFor("KeyL");

    const allTailStartStopPlay$: Observable<Action> = merge(
        startTailNoteKeyH,
        stopTailNoteKeyH,

        startTailNoteKeyJ,
        stopTailNoteKeyJ,

        startTailNoteKeyK,
        stopTailNoteKeyK,

        startTailNoteKeyL,
        stopTailNoteKeyL,
    );

    // ==============================================ALL ACTIONS==================================================

    /*
     * Main Action Stream
     */
    const actions$: Observable<Action> = merge(
        tick$,
        randNotePlay$,
        autoNotesPlay$,
        userPlaysNote$,
        allTailStartStopPlay$,
        missedScore$,
        animate$,
    );

    /**
     * Source: FRP Asteroids
     * Final Source stream
     */
    const sauce$: Observable<State> = actions$.pipe(
        scan(reduceState, initialState),
    );

    /*
     * Subscription
     */
    const subscription: Subscription = sauce$.subscribe(
        updateView(samples, () => subscription.unsubscribe()),
    );
}

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Load in the instruments and then start your game!
    const samples = SampleLibrary.load({
        instruments: SampleLibrary.list,
        baseUrl: "samples/",
    });

    const startGame = (contents: string) => {
        const onMouseDown = (event: MouseEvent) => {
            main(contents, samples, event.timeStamp);
        };

        document.body.addEventListener("mousedown", onMouseDown, {
            once: true,
        });
    };

    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;

    Tone.ToneAudioBuffer.loaded().then(() => {
        for (const instrument in samples) {
            samples[instrument].toDestination();
            samples[instrument].release = 0.5;
        }

        fetch(`${baseUrl}/assets/RockinRobin.csv`) // SleepingBeauty RockinRobin
            .then((response) => response.text())
            .then((text) => startGame(text))
            .catch((error) =>
                console.error("Error fetching the CSV file:", error),
            );
    });
}
