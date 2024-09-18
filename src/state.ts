import { GameSettings, ReactionThreshold } from "./constants";
import {
    KeyCode,
    KeyEvent,
    Note,
    NoteBody,
    UserNote,
    State,
    Action,
    Score,
    TailNote,
    Multiplier,
} from "./types";
import { not } from "./util";
import { SampleLibrary } from "./tonejs-instruments";

export {
    Tick,
    AutoPlayNote,
    UserPlaysNote,
    Animate,
    MissedNoteScore,
    PlayRandNote,
    UserPlayTailNote,
    reduceState,
    initialState,
};

/**
 * Game starts with this state
 */
const initialState: State = {
    time: 0,
    autoNote: null,
    userNote: null,
    noteViews: [],
    exit: [],
    score: {
        finalScore: 0,
        hits: 0,
        misses: 0,
    } as Score,
    multiplier: {
        scoreX: 1,
        conseqHits: 0,
    } as Multiplier,
    gameOver: false,
    // pause: false,
};

/**
 * Tick represents flow of time
 */
class Tick implements Action {
    constructor(
        public readonly time: number,
        public readonly gameEndTime: number,
    ) {}

    apply = (s: State): State => {
        const reachedEnd = (b: NoteBody): boolean =>
            !b.tail
                ? b.posY >= GameSettings.BOTTOM_ROW // a normal note reaches the end, once its y-val is >= Guitar's bottom row
                : b.tail.posY0 >= GameSettings.BOTTOM_ROW; // tail notes expire when their tail's end pos reaches the bottom row

        // From the accumulated state's noteViews, get active and inactive notes defined by above reachedEnd function
        const activeNotes: ReadonlyArray<NoteBody> = s.noteViews.filter(
            not(reachedEnd),
        );
        const inActiveNotes: ReadonlyArray<NoteBody> =
            s.noteViews.filter(reachedEnd);

        // check if game has ended or not
        const endGame = this.time * 10 >= this.gameEndTime; // converts cur time to ms

        const newMulti =
            s.multiplier.conseqHits >= 10 // if consec. hit has reached 10, increase multiplier
                ? ({
                      scoreX: s.multiplier.scoreX * 1.2, // increase current multiplier by 20%
                      conseqHits: 0, // reset the consec. hits once, multipleir increases for next time
                  } as Multiplier)
                : ({
                      ...s.multiplier,
                  } as Multiplier);

        return {
            ...s,
            time: this.time,
            autoNote: null,
            userNote: null,
            noteViews: activeNotes.map(this.moveBody), // use moveBody func to translate all active notes through each tick
            exit: inActiveNotes, // put the inactive notes in exit to remove later
            gameOver: endGame,
            multiplier: newMulti,
            score: {
                ...s.score,
                finalScore: newMulti.scoreX * (s.score.hits - s.score.misses),
            } as Score,
        };
    };

    /**
     * Inspired from FRP Asteroid from Notes - all tick-based note movement comes through this function
     * @param o NoteBody to move
     * @returns updated / moved NoteBody
     */
    moveBody = (o: NoteBody): NoteBody => {
        // If I need to cover 350px in 2 secs, how many pixels do I need to cover at each tick rate?
        // => 350 / 2 / tick rate
        const speed =
            GameSettings.BOTTOM_ROW /
            (GameSettings.DELAY / GameSettings.TICK_RATE_MS);

        // update the posY if a notBody has not reached the end
        const newPosY =
            o.posY >= GameSettings.BOTTOM_ROW ? o.posY : o.posY + speed;

        const newTail = !o.tail
            ? false // if no tail, default false
            : ({
                  ...o.tail,
                  posY0:
                      this.time * 10 >= o.tail.endTime * 1000 // if cur time has reached the end time of a note
                          ? o.tail.posY0 + speed // the end part of tail is moving down
                          : 0, // tail is still continuing to fall
                  // the tail falls at end time because the animation stream starts 2 secs early compared to stream to play notes
                  // so when a tail starts falling, it would be 2 sec behind, but it takes 2 secs to travel to bottom col
              } as TailNote);

        return {
            ...o,
            posY: newPosY,
            tail: newTail,
        };
    };
}

/**
 * Note Action to play in the background automatically
 */
class AutoPlayNote implements Action {
    constructor(public readonly note: Note) {}

    apply = (s: State): State => {
        return {
            ...s,
            autoNote: { ...this.note },
            userNote: null,
        };
    };
}

/**
 * Note Action to play by the user
 */
class UserPlaysNote implements Action {
    constructor(public readonly userNote: UserNote) {}
    apply(s: State): State {
        const newScore: Score = {
            ...s.score,
            hits: s.score.hits + 1,
        } as Score;

        return {
            ...s,
            userNote: this.userNote,
            score: newScore,
            multiplier: {
                ...s.multiplier,
                conseqHits: s.multiplier.conseqHits + 1,
            },
        };
    }
}

/**
 * Animation action class
 */
class Animate implements Action {
    constructor(public readonly userNote: UserNote) {}

    apply = (s: State): State => {
        return {
            ...s,
            autoNote: null,
            userNote: null,
            noteViews: [...s.noteViews, this.userNote.body],
        };
    };
}

/**
 * Nots that were missed to play by the user - the user did not try to play the note
 */
class MissedNoteScore implements Action {
    apply(s: State): State {
        return {
            ...s,
            score: {
                ...s.score,
                misses: s.score.misses + 1,
            } as Score,
            multiplier: { scoreX: 1, conseqHits: 0 },
        };
    }
}

/**
 * Play a random note action class when the user's key press does not align
 */
class PlayRandNote implements Action {
    constructor(
        // all these are rand nums from RNG stream in util (scaled from 0 to 1)
        public readonly instrument: number,
        public readonly velocity: number,
        public readonly pitch: number,
        public readonly duration: number,
    ) {}
    apply(s: State): State {
        // gets an idx from give randNum and lenght of an arr
        const getRandIndex = (randNum: number) => (length: number) =>
            Math.floor(randNum * length);

        // gets an elemen from input array; takes a func that returns idx
        const getRandElemFromArr =
            <T>(arrOfT: Array<T>) =>
            (getidx: (randNum: number) => (length: number) => number) =>
            (randNum: number): T => {
                return arrOfT[getidx(randNum)(arrOfT.length)];
            };

        const randInstrName: String = getRandElemFromArr<String>(
            SampleLibrary.list,
        )(getRandIndex)(this.instrument);

        const rangeOfVelPitch = [...Array(90 - 40 + 1)].map(
            // velocity from 40 to 90
            (_, i) => i + 40,
        );

        const randVel: number = getRandElemFromArr<number>(rangeOfVelPitch)(
            getRandIndex,
        )(this.velocity);

        const randPitch: number = getRandElemFromArr<number>(rangeOfVelPitch)(
            getRandIndex,
        )(this.pitch);

        const randuration: number = this.duration / 2;

        const randNote = {
            userPlayed: false,
            instrumentName: randInstrName,
            velocity: randVel,
            pitch: randPitch,
            start: 0,
            end: randuration,
        } as Note;

        return {
            ...s,
            autoNote: randNote,
            score: {
                ...s.score,
                misses: s.score.misses + 1,
            } as Score,
            multiplier: {
                // reset multiplier
                scoreX: 1,
                conseqHits: 0,
            } as Multiplier,
        };
    }
}

/**
 * Play Tail Notes Action
 */
class UserPlayTailNote implements Action {
    constructor(
        public readonly userNote: UserNote,
        public readonly play: boolean,
    ) {}
    apply = (s: State): State => {
        // console.log(this.play, this.userNote);
        const newUserNote = {
            ...this.userNote,
            body: {
                ...this.userNote.body,
                tail: {
                    ...this.userNote.body.tail,
                    playing: this.play,
                },
            } as NoteBody,
        };
        const endTimeDiff =
            s.time * 10 - GameSettings.DELAY - this.userNote.note.end * 1000;

        const hitSucceful =
            endTimeDiff <= ReactionThreshold &&
            endTimeDiff >= -ReactionThreshold;
        const newScore = hitSucceful
            ? ({ ...s.score, hits: s.score.hits + 1 } as Score)
            : ({ ...s.score } as Score);

        return {
            ...s,
            userNote: newUserNote,
            score: newScore,
            multiplier: {
                ...s.multiplier,
                conseqHits: s.score.hits % 10,
            } as Multiplier,
        } as State;
    };
}

/**
 * Source: Adopted pattern from FRP Asteroid from Course Notes and Workshop 4
 * state transducer
 * @param s input State
 * @param action type of action to apply to the State
 * @returns updated new State
 */
const reduceState = (s: State, action: Action): State => action.apply(s);
