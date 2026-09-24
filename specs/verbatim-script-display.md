# Verbatim script display

## Goal

Show the narration associated with each generated image so the user can review the spoken line and its image prompt together.

## Input

Each item in visuals may contain a verbatim_script string.

## Required behavior

1. Preserve verbatim_script when loading and saving a pipeline mapping.
2. Show a Verbatim Script block above the Image Prompt on its frame card.
3. Hide the script block when verbatim_script is empty or absent.
4. Keep prompt editing limited to the Image Prompt.
5. Always generate images with Nano Banana 2, regardless of model fields in the uploaded JSON.