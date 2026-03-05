Let's figure out how to add the dynamic blur mask. 
Right now, the background of the `.ios-catalog-header` is `transparent`. 
If we want a glassmorphic background *only when scrolled*, we can conditionally apply a CSS class when `scrolled === true`, or bind inline styles. 

For the native iOS liquid glass effect:
When `scrolled` is true:
- `background: rgba(249, 249, 249, 0.85)` (light)
- `backdrop-filter: blur(20px)`
- `border-bottom: 0.5px solid rgba(0,0,0,0.1)` (light)
