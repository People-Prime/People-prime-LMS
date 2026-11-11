import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

/**
 * ActionMenu Component
 * Provides an accessible three-dot (⋮) trigger button with an unclipped popup menu
 * rendered via React createPortal to document.body.
 *
 * Automatically closes when clicking outside, pressing Escape, or selecting an action.
 * Dynamically positions above or below the trigger button based on viewport space.
 *
 * Props:
 * - actions: Array of { label, icon, onClick, danger, disabled, title }
 * - align: 'right' (default) | 'left'
 */
export default function ActionMenu({ actions = [], align = "right" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, dropUp: false, maxHeight: 300 });
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  // Calculate exact viewport coordinates for portal popup
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    // Accurate calculation of menu height based on number of active items:
    // Container padding: 8px (4px top + 4px bottom) + 2px border
    // Each button: ~34px (fontSize 12px, line-height 1.2 (~15px) + 16px padding + gap/icon)
    const activeCount = actions.filter(Boolean).length;
    const estimatedHeight = Math.max(40, activeCount * 36 + 12);

    const menuEl = dropdownRef.current;
    const menuHeight = menuEl && menuEl.offsetHeight > 0 ? menuEl.offsetHeight : estimatedHeight;
    const menuWidth = menuEl && menuEl.offsetWidth > 0 ? menuEl.offsetWidth : 185;

    // Available space above and below the trigger button (leaving 8px margin from viewport edges)
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8);
    const spaceAbove = Math.max(0, rect.top - 8);

    // Decision logic for direction:
    // 1. If it fits cleanly below with at least 8px padding, open downwards.
    // 2. If it doesn't fit below, but fits cleanly above, open upwards.
    // 3. If it cannot fit completely in either direction, place it in whichever direction offers MORE space.
    let shouldDropUp = false;
    if (spaceBelow >= menuHeight) {
      shouldDropUp = false;
    } else if (spaceAbove >= menuHeight) {
      shouldDropUp = true;
    } else {
      shouldDropUp = spaceAbove > spaceBelow;
    }

    const availableSpace = shouldDropUp ? spaceAbove : spaceBelow;
    // Constrain maxHeight to availableSpace, ensuring it never overflows the viewport
    const maxHeight = Math.max(60, availableSpace);

    // Compute top coordinate
    let top = 0;
    if (shouldDropUp) {
      // Anchor above button: bottom of menu rests at rect.top - 4px
      const renderedHeight = Math.min(menuHeight, maxHeight);
      top = Math.max(8, rect.top - renderedHeight - 4);
    } else {
      // Anchor below button: top of menu starts at rect.bottom + 4px
      top = rect.bottom + 4;
    }

    // Horizontal position
    let left = 0;
    if (align === "right") {
      left = rect.right - menuWidth;
    } else {
      left = rect.left;
    }

    // Clamp horizontally within viewport
    if (left + menuWidth > viewportWidth - 8) {
      left = viewportWidth - menuWidth - 8;
    }
    if (left < 8) {
      left = 8;
    }

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      dropUp: shouldDropUp,
      maxHeight: Math.round(maxHeight),
    });
  }, [actions, align]);

  // Position updates on open, scroll, resize
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    // Recompute on window resize or any scroll event in capture phase
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Handle outside click & escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
        if (buttonRef.current) buttonRef.current.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const visibleActions = actions.filter(Boolean);
  if (visibleActions.length === 0) return null;

  return (
    <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-secondary action-menu-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="More actions"
        style={{
          padding: "4px 8px",
          fontSize: "15px",
          lineHeight: "1",
          minWidth: "28px",
          height: "28px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          borderRadius: "4px",
        }}
      >
        <span style={{ fontWeight: "700", letterSpacing: "1px" }}>&#8942;</span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            className="action-menu-dropdown"
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 9999,
              minWidth: "175px",
              maxWidth: "240px",
              maxHeight: `${coords.maxHeight}px`,
              overflowY: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: "var(--border-color, #475569) transparent",
              backgroundColor: "var(--bg-card, #1e293b)",
              border: "1px solid var(--border-color, #334155)",
              borderRadius: "6px",
              boxShadow: "0 10px 25px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.25)",
              padding: "4px 0",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {visibleActions.map((action, idx) => (
              <button
                key={idx}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  if (action.onClick && !action.disabled) {
                    action.onClick();
                  }
                }}
                title={action.title}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  fontWeight: "500",
                  color: action.danger
                    ? "var(--status-error, #ef4444)"
                    : action.disabled
                    ? "var(--text-secondary, #94a3b8)"
                    : "var(--text-main, #f8fafc)",
                  cursor: action.disabled ? "not-allowed" : "pointer",
                  transition: "background-color 0.15s ease",
                  opacity: action.disabled ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!action.disabled) {
                    e.currentTarget.style.backgroundColor = "var(--bg-secondary, #334155)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {action.icon && (
                  <span style={{ display: "inline-flex", alignItems: "center", fontSize: "14px" }}>
                    {action.icon}
                  </span>
                )}
                <span>{action.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

