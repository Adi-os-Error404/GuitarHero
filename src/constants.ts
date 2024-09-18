export { GameSettings, Viewport, NoteView, ReactionThreshold };

const GameSettings = {
    TICK_RATE_MS: 10,
    SONG_NAME: "RockinRobin",
    BOTTOM_ROW: 350, // represents 350px, length for each note to travel
    DELAY: 2000, // represents 2secs, the time it takes to travel 350 px
} as const;

const Viewport = {
    CANVAS_WIDTH: 200,
    CANVAS_HEIGHT: 400,
} as const;

const NoteView = {
    RADIUS: 0.07 * Viewport.CANVAS_WIDTH,
    TAIL_WIDTH: 10,
} as const;

// For lineancy and reaction time for hitting a note
const ReactionThreshold = 150;
