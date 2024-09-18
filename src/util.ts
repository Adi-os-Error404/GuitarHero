import { Note, ColumnNo, NoteBody, UserNote, TailNote } from "./types";
import { Observable, interval, from, timer, zip } from "rxjs";
import { map, scan, mergeMap } from "rxjs/operators";
import { GameSettings } from "./constants";

export {
    convertCsvToNotesArr,
    getLast,
    flattenObsOfObs,
    createNotesStream,
    isUserPlayed,
    not,
    getAssignedUserNotes,
    show,
    hide,
    createSvgElement,
    attr,
    isNotNullOrUndefined,
    getKeyToGuitarCol,
    randInstumentData$,
};

/**
 * Converts csv content into an array of Notes
 */
const convertCsvToNotesArr: (csvContents: string) => ReadonlyArray<Note> = (
    csvContents,
) => {
    const csvLines: Array<string> = csvContents.split("\n");

    const notesStrData: Array<CsvNotesArr> = csvLines
        .map((item) => item.split(",")) // split the data from each line into an array
        .splice(1) // remove header column in csv
        .filter((arr) => arr.length === 6) as CsvNotesArr[]; // filter the arr so that only valid data is remained

    return notesStrData.map((arr, i) => convertCsvArrData([...arr])(i)); // helper func turns note arr data to note obj
};

// Represents an array of a note's data from a line in the CSV file
export type CsvNotesArr = [string, string, string, string, string, string];

/**
 * Converts an array of csv line data into a Note object
 */
const convertCsvArrData =
    ([userPlayed, instrumentName, velocity, pitch, start, end]: CsvNotesArr) =>
    (i: number): Note => ({
        userPlayed: userPlayed.toLowerCase() === "true", // toLowerCase() return a new string (is pure)
        instrumentName: instrumentName,
        velocity: Number(velocity),
        pitch: Number(pitch),
        start: Number(start),
        end: Number(end),
    });

/**
 * Get the last element of an array
 */
const getLast = <T>(arr: readonly T[]): T | undefined => {
    return arr[arr.length - 1];
};

/**
 * Source: My implementation from print delay question from Applied 3
 * Flattens an observable of observables into a 1 stream
 */
const flattenObsOfObs = <T>(obs$: Observable<Observable<T>>): Observable<T> => {
    return obs$.pipe(mergeMap((innerObs$) => innerObs$));
};

/**
 * Create a stream of note states that emit at their (start time + provided delay)
 */
const createNotesStream =
    <T>(notesArr: ReadonlyArray<T>) =>
    (getStartTime: (note: T) => number) =>
    (delayAmt: number): Observable<T> =>
        from(notesArr).pipe(
            map((note) =>
                // use timer to emit a state at a specifc time
                timer(getStartTime(note) * 1000 + delayAmt).pipe(
                    map(() => note),
                ),
            ),
            flattenObsOfObs,
        );

/**
 * Source: A helper function from FRP Asteroids and Workshop 4
 * Composable function not: inverts boolean result of given function
 */
const not =
    <T>(f: (x: T) => boolean) =>
    (x: T) =>
        !f(x);

/**
 * Tells whether a note is played by the user or not
 */
const isUserPlayed: (note: Note) => boolean = (note) => note.userPlayed;

/**
 * Converts an array of Note objects into an array of UserNote objects.
 */
const getAssignedUserNotes: (
    usrNotes: ReadonlyArray<Note>,
) => ReadonlyArray<UserNote> = (usrNotes) => {
    return usrNotes.map((n: Note, i: number) => ({
        note: { ...n } as Note,
        body: assignBodyToUsrNotes(`note_${i}`)(n)(n.end - n.start > 1),
    }));
};

// Simple Heuristic
const getNoteColumn = (n: Note): ColumnNo => ((n.pitch % 4) + 1) as ColumnNo; // gets a num from 1 to 4 (ColumnNo)

/**
 * Generate a NoteBody object based on the provided id and columnNo
 */
const assignBodyToUsrNotes =
    (id: string) =>
    (note: Note) =>
    (isTail: boolean): NoteBody => {
        const columnNo = getNoteColumn(note);

        // set repeating data into id_col_posY_play_tail variable
        const id_col_posY_play_tail = {
            id: id,
            column: columnNo,
            posY: 0,
            tail: !isTail
                ? false
                : ({ playing: false, endTime: note.end, posY0: 0 } as TailNote), // if it is tail, set base vals
        };

        return columnNo === 1
            ? ({
                  ...id_col_posY_play_tail,
                  colour: "green",
                  posX: "20%",
              } as NoteBody)
            : columnNo === 2
              ? ({
                    ...id_col_posY_play_tail,
                    colour: "red",
                    posX: "40%",
                } as NoteBody)
              : columnNo === 3
                ? ({
                      ...id_col_posY_play_tail,
                      colour: "blue",
                      posX: "60%",
                  } as NoteBody)
                : ({
                      ...id_col_posY_play_tail,
                      colour: "yellow",
                      posX: "80%",
                  } as NoteBody);
    };

/**
 * Turns a key code to its associated guitar column
 */
const getKeyToGuitarCol = (code: string): ColumnNo | undefined => {
    if (code === "KeyH") return 1;
    if (code === "KeyJ") return 2;
    if (code === "KeyK") return 3;
    if (code === "KeyL") return 4;
};

/**
 * RENDERING Helper Functions:
 */

/**
 * Shows a SVG element on the canvas
 */
const show = (elem: SVGGraphicsElement) => {
    elem.setAttribute("visibility", "visible");
    elem.parentNode!.appendChild(elem);
};

/**
 * Hides a SVG element on the canvas
 */
const hide = (elem: SVGGraphicsElement) =>
    elem.setAttribute("visibility", "hidden");

/**
 * Source: FRP Asteroids and Workshop 4
 * Set a number of attributes on an Element at once
 */
const attr = (e: Element, o: { [p: string]: unknown }) => {
    for (const k in o) e.setAttribute(k, String(o[k]));
};

/**
 * Source: FRP Asteroids and Workshop 4
 * Type guard for use in filters
 */
function isNotNullOrUndefined<T extends object>(
    input: null | undefined | T,
): input is T {
    return input != null;
}

/**
 * Source: FRP Asteroids and Workshop 4
 * Creates an SVG element with the given properties.
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
) => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    attr(elem, { ...props });
    return elem;
};

/**
 * Source: Adopted from Applied 4 - scale function updated
 * A random number generator which provides two pure functions
 * `hash` and `scaleToRange`.  Call `hash` repeatedly to generate the
 * sequence of hashes.
 */
abstract class RNG {
    // LCG using GCC's constants
    private static m = 0x80000000; // 2**31
    private static a = 1103515245;
    private static c = 12345;

    /**
     * Call `hash` repeatedly to generate the sequence of hashes.
     * @param seed
     * @returns a hash of the seed
     */
    public static hash = (seed: number) => (RNG.a * seed + RNG.c) % RNG.m;

    /**
     * Takes hash value and scales it to the range [0, 1]
     */
    public static scale = (hash: number) => hash / (RNG.m - 1);
}

/**
 * * Source: From my solution to Applied 4 - slghtly updated
 *
 * Converts values in a stream to random numbers in the range [0, 1]
 *
 * This usually would be implemented as an RxJS operator, but that is currently
 * beyond the scope of this course.
 *
 * @param source$ The source Observable, elements of this are replaced with random numbers
 * @param seed The seed for the random number generator
 */
export function createRngStreamFromSource<T>(source$: Observable<T>) {
    return function createRngStream(seed: number = 0): Observable<number> {
        const randomNumberStream = source$.pipe(
            scan((acc, _) => RNG.hash(acc), seed),
            map((e) => RNG.scale(e)),
        );
        return randomNumberStream;
    };
}

const rngStream = createRngStreamFromSource(
    interval(GameSettings.TICK_RATE_MS),
);

const randInstumentData$ = zip(
    rngStream(0), // instrument
    rngStream(1), // velocity
    rngStream(2), // pitch
    rngStream(3), // duration
);
