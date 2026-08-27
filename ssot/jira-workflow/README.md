# Jira Workflow Mapping Registry

AI SDLC uses canonical internal states. Jira projects may use different native workflow names and transition IDs.

The runtime must map **canonical state → desired Jira status name** per project. It must then query the issue's currently available transitions and choose a transition whose destination status name matches the configured target.

Do not hard-code one transition ID globally. Transition IDs can differ between projects and can also differ depending on the current issue state.

Only verified status names should be configured. Unknown states remain unmapped and Jira receives comments without forced status changes.

Current verified mappings:

- `PIM.yaml`
- `RPA.yaml`
- `TMS.yaml`
- `VESPISTI.yaml`
