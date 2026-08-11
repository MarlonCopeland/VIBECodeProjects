const STYLE_ELEMENT_ID: string = 'csab-branding-styles';

/**
 * All CSS for the extension, injected once as a single stylesheet.
 *
 * This deliberately avoids `.module.scss` so the components have no build-order
 * dependency on generated typings — everything here compiles as plain TypeScript.
 * Class names are prefixed `csab-` to avoid colliding with SharePoint's own styles.
 */
const CSS: string = `
.csab-topbar {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 24px;
  background: #f3f2f1;
  border-bottom: 1px solid #e1dfdd;
  font-family: "Segoe UI", "Segoe UI Web (West European)", sans-serif;
  font-size: 13px;
  color: #323130;
}
.csab-crumb {
  color: #03787c;
  text-decoration: none;
  white-space: nowrap;
  padding: 2px 4px;
  border-radius: 2px;
}
.csab-crumb:hover { text-decoration: underline; background: #edebe9; }
.csab-crumb--current { color: #323130; font-weight: 600; }
.csab-crumb-sep { color: #a19f9d; user-select: none; }
.csab-topbar-label { font-weight: 600; color: #605e5c; margin-right: 4px; }

.csab-bottombar {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 10px 24px;
  background: #03787c;
  color: #ffffff;
  font-family: "Segoe UI", "Segoe UI Web (West European)", sans-serif;
  font-size: 14px;
}
.csab-bottombar a { color: #ffffff; text-decoration: none; }
.csab-bottombar a:hover { text-decoration: underline; }
.csab-spacer { flex: 1 1 auto; }
.csab-details-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255,255,255,0.6);
  border-radius: 2px;
  padding: 4px 12px;
  cursor: pointer;
  background: transparent;
  color: #ffffff;
  font: inherit;
}
.csab-details-link:hover { background: rgba(255,255,255,0.15); }

.csab-dialog {
  font-family: "Segoe UI", "Segoe UI Web (West European)", sans-serif;
  color: #323130;
  padding: 24px;
  min-width: 520px;
  max-width: 640px;
  box-sizing: border-box;
}
.csab-dialog h2 { margin: 0 0 4px 0; font-size: 20px; font-weight: 600; }
.csab-dialog h3 {
  margin: 24px 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #605e5c;
}
.csab-dialog-sub { margin: 0 0 8px 0; color: #605e5c; font-size: 13px; }

.csab-props { width: 100%; border-collapse: collapse; font-size: 13px; }
.csab-props th {
  text-align: left;
  padding: 6px 12px 6px 0;
  color: #605e5c;
  font-weight: 600;
  white-space: nowrap;
  vertical-align: top;
  width: 38%;
}
.csab-props td { padding: 6px 0; word-break: break-word; }

.csab-field { margin-bottom: 14px; }
.csab-field label {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 600;
}
.csab-input, .csab-select, .csab-textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #8a8886;
  border-radius: 2px;
  font: inherit;
  font-size: 14px;
  background: #ffffff;
  color: #323130;
}
.csab-input:focus, .csab-select:focus, .csab-textarea:focus {
  outline: none;
  border-color: #03787c;
  box-shadow: 0 0 0 1px #03787c;
}
.csab-textarea { min-height: 64px; resize: vertical; }
.csab-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 14px; }

.csab-picker { position: relative; }
.csab-picker-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  border: 1px solid #8a8886;
  border-radius: 2px;
  padding: 4px 6px;
  background: #ffffff;
  min-height: 32px;
}
.csab-picker-box:focus-within { border-color: #03787c; box-shadow: 0 0 0 1px #03787c; }
.csab-picker-input {
  flex: 1 1 120px;
  min-width: 120px;
  border: none;
  outline: none;
  font: inherit;
  font-size: 14px;
  padding: 4px 2px;
  background: transparent;
  color: #323130;
}
.csab-persona {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #edebe9;
  border-radius: 14px;
  padding: 2px 4px 2px 2px;
  font-size: 13px;
  max-width: 100%;
}
.csab-persona-initials {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: #03787c;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  flex: 0 0 auto;
}
.csab-persona-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.csab-persona-remove {
  border: none; background: transparent; cursor: pointer;
  color: #605e5c; font-size: 14px; line-height: 1; padding: 0 4px;
}
.csab-persona-remove:hover { color: #a4262c; }

.csab-suggestions {
  position: absolute;
  z-index: 1000000;
  left: 0; right: 0; top: 100%;
  margin-top: 2px;
  background: #ffffff;
  border: 1px solid #e1dfdd;
  box-shadow: 0 3.2px 7.2px 0 rgba(0,0,0,0.13), 0 0.6px 1.8px 0 rgba(0,0,0,0.11);
  max-height: 220px;
  overflow-y: auto;
}
.csab-suggestion {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; cursor: pointer;
}
.csab-suggestion:hover, .csab-suggestion--active { background: #f3f2f1; }
.csab-suggestion-text { display: flex; flex-direction: column; overflow: hidden; }
.csab-suggestion-name { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.csab-suggestion-mail { font-size: 12px; color: #605e5c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.csab-picker-status { padding: 6px 10px; font-size: 12px; color: #605e5c; }

.csab-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.csab-btn {
  border-radius: 2px;
  padding: 6px 20px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid #03787c;
}
.csab-btn--primary { background: #03787c; color: #ffffff; }
.csab-btn--primary:hover { background: #026064; }
.csab-btn--default { background: #ffffff; color: #323130; border-color: #8a8886; }
.csab-btn--default:hover { background: #f3f2f1; }

.csab-note {
  margin-top: 16px;
  padding: 8px 12px;
  background: #f3f2f1;
  border-left: 3px solid #03787c;
  font-size: 12px;
  color: #605e5c;
  white-space: pre-wrap;
  word-break: break-word;
}
.csab-error { color: #a4262c; font-size: 13px; }
`;

/** Injects the extension stylesheet into the page a single time. */
export function injectStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const style: HTMLStyleElement = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.appendChild(document.createTextNode(CSS));
  document.head.appendChild(style);
}
