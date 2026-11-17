import React, { useEffect, useState } from 'react';

import { evaluateArithmeticExpression } from '../../utils/sessionActivityMetrics';
import styles from './MathKeyBar.module.css';

const KEYS = [
    { text: '+', label: 'Plus' },
    { text: '−', label: 'Minus' },
    { text: '×', label: 'Times' },
    { text: '÷', label: 'Divide' },
    { text: '(', label: 'Open bracket' },
    { text: ')', label: 'Close bracket' },
];

// A result as the field would take it: no float noise ("0.30000000000000004"), no trailing zeros.
const formatResult = (value) => String(Number(value.toFixed(6)));

// Keys and the toggle never take focus, so the field keeps its keyboard and commits as usual on blur.
const keepFocus = (event) => event.preventDefault();

/** Whether the device's main pointer is a finger: its number keypads have no operator keys. */
export function hasCoarsePointer() {
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

/** Set an input's value as typing would, so React's onChange sees it, with the caret at `caret`. */
function typeInto(input, value, caret) {
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.setSelectionRange?.(caret, caret);
}

function insertAtCaret(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    typeInto(input, `${input.value.slice(0, start)}${text}${input.value.slice(end)}`, start + text.length);
}

/** The small button beside a number field that opens its operator keys. */
export function MathKeysToggle({ open, onToggle }) {
    return (
        <button
            type="button"
            className={styles.toggle}
            aria-label={open ? 'Hide math keys' : 'Show math keys'}
            aria-expanded={open}
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
            onClick={onToggle}
        >
            +−
        </button>
    );
}

/**
 * Operator keys for a number field, in a row just under it: phone number pads have no + − × ÷.
 * Shows what the field works out to, and "=" puts that in the field.
 */
export default function MathKeyBar({ inputRef }) {
    // What the field holds, followed as it's typed into (the field is uncontrolled).
    const [text, setText] = useState('');
    useEffect(() => {
        const input = inputRef.current;
        if (!input) return undefined;
        const sync = () => setText(input.value);
        sync();
        input.addEventListener('input', sync);
        return () => input.removeEventListener('input', sync);
    }, [inputRef]);

    const isExpression = /[+\-*/×÷−()]/.test(text.trim().replace(/^[+-]/, ''));
    const result = isExpression ? evaluateArithmeticExpression(text) : null;
    const press = (apply) => () => {
        const input = inputRef.current;
        if (input) apply(input);
    };

    return (
        <div
            className={styles.bar}
            role="toolbar"
            aria-label="Math keys"
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
        >
            {KEYS.map((key) => (
                <button
                    key={key.text}
                    type="button"
                    tabIndex={-1}
                    className={styles.key}
                    aria-label={key.label}
                    onClick={press((input) => insertAtCaret(input, key.text))}
                >
                    {key.text}
                </button>
            ))}
            <button
                type="button"
                tabIndex={-1}
                className={`${styles.key} ${styles.equals}`}
                aria-label={result == null ? 'Equals' : `Equals ${formatResult(result)}`}
                disabled={result == null}
                onClick={press((input) => {
                    const value = formatResult(result);
                    typeInto(input, value, value.length);
                })}
            >
                {result == null ? '=' : `= ${formatResult(result)}`}
            </button>
        </div>
    );
}
