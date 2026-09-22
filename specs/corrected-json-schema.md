# Corrected JSON schema support

## Goal

Load the provided spec_v2 storyboard without losing its project settings or confusing local image paths with Google Flow tags.

## Required behavior

1. Read the project name from project when project_name is absent.
2. Preserve global_settings, and read aspect_ratio, style, negative_prompt, and max_retries from it.
3. Keep a nested Veo video model as metadata; only top-level default_model, image_model, or model may select the image model.
4. Use the project value as the default output folder.
5. Preserve character flow_tag for Google Flow reference selection.
6. Preserve image_url as metadata. Do not treat it as a Flow reference name.
7. Preserve frame timestamps, script text, reference metadata, and extra reference arrays.
8. Use the global negative prompt when a frame does not provide one.