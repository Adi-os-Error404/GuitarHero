export type {
    KeyCode,
    KeyEvent,
    Note,
    ColumnNo,
    NoteBody,
    UserNote,
    State,
    Action,
    Score,
    TailNote,
    Multiplier,
};

/**
 * String literal type for keys
 */
type KeyCode = "KeyH" | "KeyJ" | "KeyK" | "KeyL";

/**
 *  Input key type events
 */
type KeyEvent = "keydown" | "keyup" | "keypress";

/**
 *  Note to be played
 */
type Note = Readonly<{
    userPlayed: boolean;
    instrumentName: string;
    velocity: number;
    pitch: number;
    start: number;
    end: number;
}>;

/**
 *  Possible Guitar columns/strings
 */
type ColumnNo = 1 | 2 | 3 | 4;

/**
 *  Note Body data used for animation
 */
type NoteBody = Readonly<{
    id: string;
    column: ColumnNo;
    colour: "green" | "red" | "blue" | "yellow";
    posX: "20%" | "40%" | "60%" | "80%";
    posY: number;

    tail: false | TailNote;
}>;

/**
 * Data for notes with tails
 */
type TailNote = Readonly<{
    playing: boolean;
    endTime: number;
    posY0: number; // represents y1 of line element
}>;

/**
 *  User Note to be played through user interaction
 */
type UserNote = Readonly<{
    body: NoteBody;
    note: Note;
}>;

/**
 * Score tracking
 */
type Score = Readonly<{
    finalScore: number;
    hits: number;
    misses: number;
}>;

/**
 * Multiplier data
 */
type Multiplier = Readonly<{
    scoreX: number; // score multiplier
    conseqHits: number;
}>;

/**
 *  Game State
 */
type State = Readonly<{
    time: number;
    autoNote: Note | null; // note to be played automatically or in the background; null if no note to play
    userNote: UserNote | null; // note to be played by the player
    noteViews: ReadonlyArray<NoteBody>; // active NoteBody data to be animated
    exit: ReadonlyArray<NoteBody>; // inspired from FRP asteroids, to move all the expired NoteBody data exit
    score: Score;
    multiplier: Multiplier;
    gameOver: boolean;
    // pause: boolean;
}>;

/**
 * A contract / interface for all classes to implement, later used in reduceState for scan
 * Source: Workshop 4 and FRP Asteroids from Course Notes
 */
interface Action {
    apply(s: State): State;
}
