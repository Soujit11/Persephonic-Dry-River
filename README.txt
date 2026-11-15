Persephonic - Dry River
An interactive WebXR art piece (three.js + Satie spatial sound), made at Immerse the Bay 2026.

Audio and sound design: Satie AI by Attractor Labs. The sounds of the river, the meadow,
the house and its fire were described in Satie, generated and placed in 3D by it, and are
played through the Satie runtime, tied to the state of the world.

Live version: https://persephonic.netlify.app
Open it on a Meta Quest in the Meta Quest Browser and press "Enter VR"
(hand tracking on). On a computer: click the riverbed, drag to look, walk with W A S D.

In VR (hand tracking or Quest 3 / 3S Touch Plus controllers)
  A short lesson opens every visit: look, step, turn, walk, call the river,
  water the meadow. Each one waits until you have tried it.
  Two hands, two jobs. The LEFT hand moves you: point it at the ground, press the left
  trigger (or pinch with the left hand) and let go to step there; push the left thumbstick
  to walk (you follow the ground down into the riverbed and up the hills). Flick the right
  thumbstick to turn 30 degrees.
  The RIGHT hand does everything else: reach for something (it glows softly when in reach)
  and press the right trigger or pinch. Point the right hand at the dry riverbed and press
  to call the water back. The right hand never moves you, and indoors it only touches.
  The controllers buzz when something answers your touch.
  Point the right hand at the ruins and hold the trigger: the house rebuilds itself.
  Hold the right trigger while pointing at the bank to water the meadow.
  Holding the right trigger at a flower waters it too,
  and a flower that has fully opened stays open.
  Touch the lantern and the door handle, then point the left hand inside to step in.
  Inside: the books are in disarray; press at the shelf to put them in order.
  The cloth wipes either window from arm's length. Pick up the fish food tin, hold it over the bowl and hold the trigger to sprinkle.
  A (right) or X (left) puts down whatever you hold: the tin, the cloth, the kettle.
  Reach for the sofa cushion or the armchair arm and press the trigger to sit. To stand,
  push either thumbstick, press A, press the left trigger, or press the right trigger at the seat. (Hands: pinch at the seat.)
  Steps you point from inside the room stop at the walls; you leave by the open door.
  If you ever end up inside a wall or outside the valley, wait a moment: you are moved back.
  You stay inside the valley, and the house walls only let you in by the door.
  Inside, everything answers a touch. Soft words fade in to suggest the next
  step, and a gentle glow marks what you can touch. Inside the house they wait
  for a quiet moment before offering something new (the fire, the sofa, the cat).
  Echo: press "Echo on" before "Enter VR" if you want the hills to answer your voice.

Files
  index.html            the whole scene (three.js loaded from a CDN)
  satie/scene.satie     the spatial sound scene
  satie/samples.json    links to the recorded sounds
  vendor/satie-runtime  the Satie sound runtime

To run it locally it must be served over http(s), not opened as a file, e.g.
  npx serve .      (then open the address it prints)
Microphone echo and VR need https (or localhost).

Emulator trial
  Open the site with ?vrtest at the end of the address (for example
  https://sprightly-narwhal-7058c1.netlify.app/?vrtest) on a computer.
  Meta's IWER emulator stands in for a Quest and vrtest.js plays through
  the experience, listing each check on screen. Without ?vrtest nothing loads.

License
  The project's own code is MIT licensed (see LICENSE). The Satie Runtime in
  vendor/satie-runtime is Attractor Labs' proprietary software, included unmodified
  under its own license, and the Satie audio scene follows Satie's terms.
