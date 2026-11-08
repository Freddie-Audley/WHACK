# First Contact
By whack_a_snake

## Problem Statement

Make a project that explores the idea of New Worlds. Build something that
opens a door to the unexplored, whether that's new data, ideas or something
novel no one has seen before.
Interpret the theme however you think best
captures the spirit of this idea!

### Sponsor: Marshall Wace

First Contact is a cooperative game about discovering a new world through
pictures. One player is an alien ambassador introducing their home planet.
The other watches the ambassador's drawings and tries to imagine what life
there is like.

Each world has its own skies, weather, terrain, plants, and animals. As clues
are revealed, the listener's imagined world takes shape in a 3D scene. The
drawings can be mysterious, and the alien's cheerful commentary may not
always mean what the listener expects.

## Play together

The main game uses two computers with screens:

1. On the first computer, choose **Be the alien**.
2. On the second computer, choose **Be the listener** and allow camera access.
3. Point the listener's webcam at the alien's screen so it can see the
   drawing board.
4. Watch the drawings appear and see what kind of world the listener
   discovers.

The alien introduces the world through a series of drawings. The listener
can change their interpretation as each drawing develops; once it is put
away, the next clue begins.

## Draw your own world

Choose **Be Earth** to draw on the board yourself, with an Earth landscape
behind it. This mode is also the one that opens on a phone. On a computer,
use the board's drawing tools. On a phone, tap to draw and tap a pixel again
to switch its color. Press **Enter** to clear the board.

## Run the game

You need Node.js and npm. The alien and listener modes also need an Anthropic
API key and an internet connection. The listener needs a webcam.

1. Install the app's dependencies:

   ```sh
   npm install
   ```

2. Set your Anthropic API key as `ANTHROPIC_API_KEY`, or put it in a `.env`
   file in the project folder:

   ```dotenv
   ANTHROPIC_API_KEY=your_anthropic_api_key
   ```

3. Start the app:

   ```sh
   npm run dev
   ```

The game opens with buttons for **Be the alien**, **Be the listener**, and
**Be Earth**.

### Make your own new world

The main menu shows the world builder. Choose one option in each category;
the first option in each category is selected by default. Choose **Make your
own new world** to start as the alien with those selections. **Be the alien**
and **Be the listener** continue to use randomly generated worlds.
Press **R** or choose **Reset** to replay the last option; a custom world is
replayed with the same selections.

### Open Be Earth on a phone

To try the drawing mode on a phone connected to the same local network:

```sh
npm run phone
```

Open the address printed in the terminal on your phone. This mode is for drawing your own board; play the alien and listener
modes in the desktop app.
