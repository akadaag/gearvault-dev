import re

with open('src/index.css', 'r') as f:
    css = f.read()

# Add a generic title pill style if not present
if "ios-title-pill" not in css:
    pill_css = """
/* ── Generic Floating Title Pill ── */
.ios-title-pill {
  display: inline-flex;
  align-items: center;
  padding: 10px 22px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.10), 0 0 0 0.5px rgba(0, 0, 0, 0.06);
  font-size: 16px;
  font-weight: 600;
  color: var(--ios-text-primary);
  letter-spacing: -0.01em;
  pointer-events: auto;
}
:root.dark .ios-title-pill {
  background: rgba(44, 44, 46, 1);
  color: #ffffff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.30), 0 0 0 0.5px rgba(255, 255, 255, 0.08);
}
.ios-title-pill-container {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 16px;
}
"""
    # Append to the end of the file
    css += "\n" + pill_css

with open('src/index.css', 'w') as f:
    f.write(css)

