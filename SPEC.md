# Feature brief

## Implement: Full Pause Menu

When the game is paused (P or Escape), display an overlay with functional options:

- Resume — return to the game
- Restart — start a new game without reloading the page
- View Controls — show the list of keys inside the menu
- Starting Level — a selector for choosing the level at which the next game will begin
- Block game inputs while the menu is open to prevent accidental movement when resuming

## Implement: Local Leaderboard

Save the best scores in localStorage:

- Top 5 scores with the player’s name (text field on the game-over screen)
- Display the leaderboard on the start screen and in the game-over overlay
- Highlight when the current score makes it into the top scores
- Add a button to reset the leaderboard
- Also display the best combo and the maximum number of lines cleared

## Implement: Visual Themes / Skins

Add a skin selector that changes the game’s entire appearance:

- Retro — square blocks and flat colors (current style)
- Neon — black background and a glow effect using shadowBlur on the canvas
- Pastel — soft colors with simulated rounded borders
- Pixel Art — a texture pattern drawn over each block

Save the preference in localStorage; apply changes without reloading by updating the color constants and drawing function.
