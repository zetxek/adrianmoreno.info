Two changes, both from the owner using the feature on a 390x844 phone. Iterate; do not
rewrite the world.

## 1. The full-screen trigger belongs IN the widget, not floating out of context

Owner, verbatim: "I'd also like an integrated way to trigger the game mode, like a
'Fullscreen' button in the widget itself. The current is quite out of context."

Right now the entry control is a separate element that does not read as part of the
scroll-driven dock/widget the reader is already looking at. Move it INTO that widget so
it reads as one object with the journey controls: same surface, same border language, same
touch target sizing, no floating orphan. It must remain:
 - reachable in the FIRST viewport at 390x844 with a non-zero rect (this is a release gate
   in the gamify spec; measure it, do not assume it);
 - >= 44px in both dimensions for a thumb;
 - labelled for assistive tech with an exact accessible name string, reported verbatim;
 - hidden in reduced-motion and no-JS paths without leaving a gap in the widget layout.
Report the widget's element order and the entry's rect before and after.

## 2. In full screen, the game must be genuinely interactive

Owner: "When Fullscreen we should make the game more interactive."

Today it offers arrow keys and a progress control. That is a scrubber, not a game. Make
it interactive in a way that is still true to this project:

 - Motion remains a PURE FUNCTION OF INPUT (scroll progress or explicit user input). There
   must be NO idle rAF loop, NO timer, NO elapsed-time animation, and no CSS transition.
   An E2E test enforces the absence of an idle loop -- do not break it. Reduced motion
   still renders no motion at all.
 - Prefer interaction that carries meaning rather than decoration. This page is a VP-level
   engineering leader's portfolio told as one continuous waterborne journey through seven
   chapters; the reader should be able to DO something that reveals something. Candidates
   to evaluate and choose from (choose, justify, and say what you rejected):
     * scrubbing/steering the vessel along the course with a direct-manipulation control,
       with the seven chapter markers as targets that respond when reached;
     * inspectable landmarks: something the reader can act on at each chapter that reveals
       a fact or a line already present in data/race.yml;
     * a pace/segment control that reflects the swim/bike/run structure;
     * keyboard parity for everything (arrows already exist) plus visible focus.
 - It must not become a toy. No score, no points, no sound, no randomness.
 - Every class introduced MUST have a rule in assets/css/race.css. A class with no CSS is
   an invisible feature; that bug has shipped on this page three times. List each new class
   and its selector, and grep the SERVED html for each control to prove it is in the DOM.

## VERIFY BY MEASUREMENT
 - `hugo server -D --port 1313`, confirm `curl -s localhost:1313 | grep -c livereload` >= 1;
   kill by port with `lsof -ti:1313`, never `pkill -f 'hugo server'`.
 - 390x844 AND 1440x900: report the entry control's rect + accessible name, then enter game
   mode with a real click and exercise the new interaction. Report what changes when it is
   used, with numbers (positions, values, DOM state), not adjectives.
 - Screenshot in and out of full screen at several positions and read the frames back;
   state honestly what a viewer sees.
 - Report unit results, e2e results, triangle tallies (must stay 3,500 / 419), gzip delta.

Do NOT weaken or delete an existing passing test. If one is genuinely wrong, say so.

Commit with the trailer:
Prepared by @zetxek via an AI coding agent
