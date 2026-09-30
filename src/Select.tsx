import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};
export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 200,
    maxHeight: 280,
  });
  const selected = options.find((option) => option.value === value);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = trigger.current!.getBoundingClientRect();
      const width = Math.max(200, Math.min(320, bounds.width));
      const height = Math.min(280, options.length * 43 + 12);
      const below = innerHeight - bounds.bottom - 12;
      setPosition({
        left: Math.max(8, Math.min(bounds.left, innerWidth - width - 8)),
        top:
          below >= Math.min(height, 140)
            ? bounds.bottom + 5
            : Math.max(8, bounds.top - height - 5),
        width,
        maxHeight: Math.max(
          100,
          below >= Math.min(height, 140)
            ? Math.min(height, below)
            : Math.min(height, bounds.top - 12),
        ),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options.length]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useEffect(() => {
    if (open)
      menu.current
        ?.querySelector(`[data-index="${focus}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [focus, open]);
  const choose = (index: number) => {
    if (!options[index] || options[index].disabled) return;
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };
  function move(delta: number) {
    let next = focus;
    for (let i = 0; i < options.length; i++) {
      next = (next + delta + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setFocus(next);
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`custom-select ${compact ? "compact-select" : ""}`}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${focus}` : undefined}
        disabled={disabled}
        onClick={() => {
          if (!options.length) return;
          setFocus(
            Math.max(
              0,
              options.findIndex((option) => option.value === value),
            ),
          );
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            if (!open) {
              setFocus(
                Math.max(
                  0,
                  options.findIndex((option) => option.value === value),
                ),
              );
              setOpen(true);
            } else move(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            choose(focus);
          } else if (event.key === "Escape" || event.key === "Tab")
            setOpen(false);
          else if (open && event.key === "Home") {
            event.preventDefault();
            setFocus(0);
          } else if (open && event.key === "End") {
            event.preventDefault();
            setFocus(options.length - 1);
          } else if (open && event.key.length === 1) {
            const found = options.findIndex(
              (option) =>
                !option.disabled &&
                option.label.toLowerCase().startsWith(event.key.toLowerCase()),
            );
            if (found >= 0) setFocus(found);
          }
        }}
      >
        <span>{selected?.label || label}</span>
        <ChevronDown size={12} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={`${id}-list`}
            className="select-menu"
            role="listbox"
            aria-label={label}
            style={position}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-${index}`}
                data-index={index}
                className={`select-option ${focus === index ? "focused" : ""}`}
                role="option"
                aria-selected={value === option.value}
                aria-disabled={option.disabled || undefined}
                onPointerMove={() => setFocus(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span>
                  <b>{option.label}</b>
                  {option.description && <small>{option.description}</small>}
                </span>
                {value === option.value && <Check size={13} />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
