import {
    KeyCode,
    KeyEvent,
    Note,
    NoteBody,
    UserNote,
    State,
    Action,
} from "./types";
import { GameSettings, Viewport, NoteView } from "./constants";
import {
    show,
    hide,
    createSvgElement,
    attr,
    isNotNullOrUndefined,
} from "./util";
import * as Tone from "tone";

export { updateView };

/**
 * Update the SVG game view.
 *
 * @param onFinish a callback function to be applied when the game ends, to clean up subcription
 * @param s the current game model State
 * @returns void
 */
function updateView(
    samples: { [key: string]: Tone.Sampler },
    onFinish: () => void,
): (_: State) => void {
    return function (s: State): void {
        // Canvas elements:
        const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
            HTMLElement;
        const preview = document.querySelector(
            "#svgPreview",
        ) as SVGGraphicsElement & HTMLElement;
        const gameover = document.querySelector(
            "#gameOver",
        ) as SVGGraphicsElement & HTMLElement;
        const container = document.querySelector("#main") as HTMLElement;

        // Set Canvas:
        svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
        svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);

        // Text fields:
        const scoresText = document.querySelector("#scoreText") as HTMLElement;
        const hitsText = document.querySelector("#hitsText") as HTMLElement;
        const missesText = document.querySelector("#missesText") as HTMLElement;
        const multiText = document.querySelector(
            "#multiplierText",
        ) as HTMLElement;
        const conseqHitsText = document.querySelector(
            "#conseqHits",
        ) as HTMLElement;

        // Souce: Adtoped from FRP Asteroids
        const updateBodyView = (rootSVG: HTMLElement) => (b: NoteBody) => {
            // Create a note circle
            function createNotBody() {
                const noteSvg = createSvgElement(
                    rootSVG.namespaceURI,
                    "circle",
                    {
                        id: b.id,
                        r: `${NoteView.RADIUS}`,
                        cx: `${b.posX}`,
                        cy: `${b.posY}`,
                        style: `fill: ${b.colour}`,
                        class: "shadow",
                    },
                );
                rootSVG.appendChild(noteSvg);
                return noteSvg;
            }

            // Create a tail for tailed notes
            function createNoteBodyWithTail() {
                const tailSvg = createSvgElement(rootSVG.namespaceURI, "line", {
                    id: b.id + "-tail",
                    x1: `${b.posX}`,
                    y1: "0",
                    x2: `${b.posX}`,
                    y2: `${b.posY}`,
                    stroke: `${b.colour}`,
                    "stroke-width": "25",
                    "stroke-opacity": "0.75",
                    "stroke-linecap": "round",
                });
                rootSVG.appendChild(tailSvg);
                return tailSvg;
            }

            if (!b.tail) {
                const v = document.getElementById(b.id) || createNotBody();
                attr(v, { cx: b.posX, cy: b.posY });
            } else {
                const noteSvg = document.getElementById(`${b.id}`);
                const tailSvg = document.getElementById(`${b.id}-tail`); // search by tail id

                if (!tailSvg) {
                    createNoteBodyWithTail();
                }
                if (!noteSvg) {
                    createNotBody();
                }

                if (tailSvg && noteSvg) {
                    attr(noteSvg, {
                        cy: b.posY,
                    });
                    attr(tailSvg, {
                        y1: b.tail.posY0,
                        y2: b.posY,
                    });
                }
            }
        };

        s.noteViews.forEach(updateBodyView(svg));

        // Source: Adopted from FRP Asteroids - Search and remove the svg elements
        s.exit
            .map((o) => document.getElementById(o.id))
            .filter(isNotNullOrUndefined)
            .forEach((v) => {
                try {
                    svg.removeChild(v);
                } catch (e) {
                    console.log("Already removed: " + v.id);
                }
            });

        s.exit
            .map((o) => document.getElementById(o.id + "-tail"))
            .filter(isNotNullOrUndefined)
            .forEach((v) => {
                try {
                    svg.removeChild(v);
                } catch (e) {
                    console.log("Already removed: " + v.id);
                }
            });

        s.noteViews.forEach(updateBodyView(svg));
        s.exit
            .map((o) => document.getElementById(o.id))
            .filter(isNotNullOrUndefined)
            .forEach((v) => {
                try {
                    svg.removeChild(v);
                } catch (e) {
                    console.log("Already Removed: " + v.id);
                }
            });

        // Update Scores:
        hitsText.textContent = s.score.hits.toString();
        missesText.textContent = s.score.misses.toString();
        scoresText.textContent = Math.round(s.score.finalScore).toString();

        multiText.textContent = s.multiplier.scoreX.toString() + "x";
        conseqHitsText.textContent = s.multiplier.conseqHits.toString();

        // func that plays a note
        const playNote = (note: Note) => {
            return samples[note.instrumentName].triggerAttackRelease(
                Tone.Frequency(note.pitch, "midi").toNote(),
                note.end - note.start,
                undefined,
                note.velocity / 127,
            );
        };

        if (s.autoNote) {
            playNote(s.autoNote);
        }
        if (s.userNote && !s.userNote.body.tail) {
            playNote(s.userNote.note);
        }

        if (s.userNote && s.userNote.body.tail) {
            const note = s.userNote.note;
            if (s.userNote.body.tail.playing) {
                samples[note.instrumentName].triggerAttack(
                    Tone.Frequency(note.pitch, "midi").toNote(),
                    undefined,
                    note.velocity / 127,
                );
            }
            if (!s.userNote.body.tail.playing) {
                samples[note.instrumentName].triggerRelease(
                    Tone.Frequency(note.pitch, "midi").toNote(),
                );
            }
        }

        if (s.gameOver) {
            show(gameover);
            onFinish();
        } else {
            hide(gameover);
        }
    };
}
