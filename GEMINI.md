# Gflow_MCP — Workspace Agent Instructions

Welcome to the **Gflow_MCP** workspace. This workspace contains the unlocked VEO Automation Chrome Extension for Google Flow, the Spec-Driven pipeline engine, and reference models.

---

## Mandatory Instructions

All tasks, spec generation, and pipeline modifications **MUST strictly comply with**:
- [PROJECT_WORKFLOW_SPEC.md](file:///E:/Gflow_MCP/PROJECT_WORKFLOW_SPEC.md)

### Key Rules for Any AI Agent
1. **Spec-Driven Mode**: Never make direct MCP image generation calls (`veo_generate_*`). Deliver production specs (`storyboard_spec.json` & `timeline_blueprint.json`) for user execution in the Chrome Extension Side Panel (**Spec Pipeline** tab).
2. **Strict Visual Consistency**:
   - Every visual frame MUST include the locked negative prompt (`photorealistic, 3D render, CGI, glossy, hyper-detailed skin, gradients, airbrush, dark muddy lighting, realistic human faces, detailed anatomical skeleton, painterly textures, oil painting, realistic photograph`).
   - Every visual frame MUST have a reference: `@character_reference`, `frame_reference`, or the Master Style Anchor (`@narrator_stickfigure`).
   - Scene-Only Prompts: Never describe character physical traits in prompt text when a character reference is attached.
3. **Reference Tagging Protocol**:
   - Reference frames are selected via `@` mention in Google Flow's **`Images`** tab using clean 2-word queries.
   - Never trigger the local upload menu (`drive_folder_upload`) for existing project frames.
