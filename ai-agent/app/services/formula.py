"""Safe evaluation of admin-authored formulas.

The admin form builder stores formulas as a token list (``FormulaValue.tokens``):

    {"kind": "variable", "variableId": "..."} | {"kind": "operator", "value": "+"}
    | {"kind": "function", "value": "max"}   | {"kind": "number", "value": "12.5"}

This module evaluates that list with a hand-written shunting-yard parser. ``eval`` and
``exec`` are never used, so a malicious formula cannot execute code.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping

_TOKEN_KINDS = {"variable", "operator", "function", "number"}

#: Fixed arity for every supported function (``min``/``max``/``pow`` take two arguments).
FUNCTION_ARITY: dict[str, int] = {
    "sin": 1,
    "cos": 1,
    "tan": 1,
    "sqrt": 1,
    "round": 1,
    "abs": 1,
    "pow": 2,
    "min": 2,
    "max": 2,
}

_PRECEDENCE = {"+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3}
_RIGHT_ASSOCIATIVE = {"^"}
_UNARY = "u-"

_PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
_ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"


class FormulaError(ValueError):
    """The formula is malformed or uses an unsupported construct."""


def _to_number(raw: str) -> float:
    text = (raw or "").strip()
    for index, digit in enumerate(_PERSIAN_DIGITS):
        text = text.replace(digit, str(index))
    for index, digit in enumerate(_ARABIC_DIGITS):
        text = text.replace(digit, str(index))
    text = text.replace("٫", ".").replace(",", "")
    try:
        return float(text)
    except ValueError as exc:  # pragma: no cover - guarded by the admin editor
        raise FormulaError(f"عدد نامعتبر در فرمول: {raw!r}") from exc


def _apply(operator: str, args: list[float]) -> float:
    if operator == _UNARY:
        return -args[-1]
    if operator == "+":
        return args[-2] + args[-1]
    if operator == "-":
        return args[-2] - args[-1]
    if operator == "*":
        return args[-2] * args[-1]
    if operator == "/":
        divisor = args[-1]
        return 0.0 if divisor == 0 else args[-2] / divisor
    if operator == "%":
        divisor = args[-1]
        return 0.0 if divisor == 0 else math.fmod(args[-2], divisor)
    if operator == "^":
        return args[-2] ** args[-1]
    raise FormulaError(f"عملگر پشتیبانی‌نشده: {operator!r}")


def _call_function(name: str, args: list[float]) -> float:
    if name == "sin":
        return math.sin(args[-1])
    if name == "cos":
        return math.cos(args[-1])
    if name == "tan":
        return math.tan(args[-1])
    if name == "sqrt":
        return math.sqrt(args[-1]) if args[-1] >= 0 else 0.0
    if name == "round":
        return float(round(args[-1]))
    if name == "abs":
        return abs(args[-1])
    if name == "pow":
        return args[-2] ** args[-1]
    if name == "min":
        return min(args[-2], args[-1])
    if name == "max":
        return max(args[-2], args[-1])
    raise FormulaError(f"تابع پشتیبانی‌نشده: {name!r}")


def _normalise_tokens(tokens: Iterable[Mapping[str, object]]) -> list[tuple[str, object]]:
    output: list[tuple[str, object]] = []
    for token in tokens:
        kind = str(token.get("kind") or "")
        if kind not in _TOKEN_KINDS:
            raise FormulaError(f"توکن ناشناخته: {kind!r}")
        if kind == "variable":
            output.append(("variable", str(token.get("variableId") or "")))
        else:
            output.append((kind, str(token.get("value") or "")))
    return output


def evaluate_formula(
    formula: Mapping[str, object] | None,
    values: Mapping[str, object] | None,
) -> float:
    """Evaluate ``formula`` against ``values`` (``variableId`` → number).

    Unknown variables resolve to ``0`` so a half-filled form still produces a number;
    malformed formulas raise :class:`FormulaError`.
    """
    raw_tokens = (formula or {}).get("tokens")
    if not isinstance(raw_tokens, list) or not raw_tokens:
        return 0.0

    tokens = _normalise_tokens([token for token in raw_tokens if isinstance(token, Mapping)])
    scope = values or {}

    output: list[tuple[str, object]] = []
    stack: list[tuple[str, str]] = []
    previous_kind: str | None = None
    previous_value: str | None = None

    for kind, value in tokens:
        if kind == "number":
            output.append(("number", _to_number(str(value))))
        elif kind == "variable":
            number = scope.get(str(value))
            if number is None or number == "":
                output.append(("number", 0.0))
            else:
                output.append(("number", _to_number(str(number))))
        elif kind == "function":
            name = str(value).lower()
            if name not in FUNCTION_ARITY:
                raise FormulaError(f"تابع پشتیبانی‌نشده: {name!r}")
            stack.append(("function", name))
        elif kind == "operator":
            operator = str(value)
            if operator == "(":
                stack.append(("paren", "("))
            elif operator == ")":
                while stack and stack[-1][0] != "paren":
                    output.append(stack.pop())
                if not stack:
                    raise FormulaError("پرانتز بسته بدون پرانتز باز.")
                stack.pop()
                if stack and stack[-1][0] == "function":
                    output.append(stack.pop())
            elif operator == ",":
                while stack and stack[-1][0] != "paren":
                    output.append(stack.pop())
                if not stack:
                    raise FormulaError("ویرگول خارج از فراخوانی تابع.")
            elif operator in _PRECEDENCE:
                wrapped = operator == "-" and (
                    previous_kind is None
                    or (
                        previous_kind == "operator"
                        and previous_value not in {")"}
                    )
                )
                current = _UNARY if wrapped else operator
                precedence = 3 if current == _UNARY else _PRECEDENCE[operator]
                while stack and stack[-1][0] == "operator":
                    top = stack[-1][1]
                    top_precedence = 3 if top == _UNARY else _PRECEDENCE.get(top, 0)
                    if top_precedence > precedence or (
                        top_precedence == precedence and operator not in _RIGHT_ASSOCIATIVE
                    ):
                        output.append(stack.pop())
                    else:
                        break
                stack.append(("operator", current))
            else:
                raise FormulaError(f"عملگر پشتیبانی‌نشده: {operator!r}")
            previous_value = operator
        previous_kind = kind

    while stack:
        entry = stack.pop()
        if entry[0] == "paren":
            raise FormulaError("پرانتز باز بدون پرانتز بسته.")
        output.append(entry)

    # ------------------------------------------------------------------ evaluate
    numbers: list[float] = []
    for kind, value in output:
        if kind == "number":
            numbers.append(float(value))
        elif kind == "operator":
            operator = str(value)
            arity = 1 if operator == _UNARY else 2
            if len(numbers) < arity:
                raise FormulaError("فرمول ناقص است.")
            args = [numbers.pop() for _ in range(arity)][::-1]
            numbers.append(_apply(operator, args))
        elif kind == "function":
            name = str(value)
            arity = FUNCTION_ARITY.get(name, 1)
            if len(numbers) < arity:
                raise FormulaError("فرمول ناقص است.")
            args = [numbers.pop() for _ in range(arity)][::-1]
            numbers.append(_call_function(name, args))

    if len(numbers) != 1:
        raise FormulaError("فرمول معتبر نیست.")
    result = numbers[0]
    if math.isnan(result) or math.isinf(result):
        return 0.0
    return round(result, 6)
