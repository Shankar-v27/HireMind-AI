"""Sandboxed code execution helpers for coding rounds."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Any, Literal

Language = Literal["python", "javascript", "cpp", "c", "java"]

TIMEOUT_SECONDS = 10
MAX_OUTPUT_LEN = 10000

_EXTRA_PATHS = [
    "/opt/homebrew/opt/openjdk/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
]
_EXEC_PATH = os.environ.get("PATH", "")
for _p in _EXTRA_PATHS:
    if os.path.isdir(_p) and _p not in _EXEC_PATH:
        _EXEC_PATH = _p + os.pathsep + _EXEC_PATH


def _exec_env() -> dict[str, str]:
    return {**os.environ, "PATH": _EXEC_PATH}


@dataclass
class TestCaseResult:
    input: str
    expected: str
    actual: str
    passed: bool
    error: str | None = None


@dataclass
class ExecutionResult:
    passed: int = 0
    failed: int = 0
    total: int = 0
    results: list[dict[str, Any]] = field(default_factory=list)


LANGUAGE_CONFIG = {
    "python": {"ext": ".py", "cmd": ["python"], "compiled": False},
    "javascript": {"ext": ".js", "cmd": ["node"], "compiled": False},
    "cpp": {"ext": ".cpp", "compile_cmd": ["g++", "-std=c++17", "-O2", "-o"], "compiled": True},
    "java": {"ext": ".java", "compiled": True},
    "c": {"ext": ".c", "compile_cmd": ["gcc", "-O2", "-o"], "compiled": True},
}


def execute_code(code: str, language: str = "python", stdin: str = "", timeout: int = TIMEOUT_SECONDS) -> dict[str, Any]:
    lang = LANGUAGE_CONFIG.get(language)
    if not lang:
        return {"stdout": "", "stderr": f"Unsupported language: {language}", "exit_code": 1, "timed_out": False}
    if lang.get("compiled"):
        return _execute_compiled(code, language, lang, stdin, timeout)
    return _execute_interpreted(code, lang, stdin, timeout)


def _execute_interpreted(code: str, lang: dict[str, Any], stdin: str, timeout: int) -> dict[str, Any]:
    with tempfile.NamedTemporaryFile(suffix=lang["ext"], mode="w", delete=False) as f:
        f.write(code)
        f.flush()
        filepath = f.name
    try:
        result = subprocess.run(
            lang["cmd"] + [filepath],
            input=stdin,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_exec_env(),
        )
        return {
            "stdout": result.stdout[:MAX_OUTPUT_LEN],
            "stderr": result.stderr[:MAX_OUTPUT_LEN],
            "exit_code": result.returncode,
            "timed_out": False,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out", "exit_code": -1, "timed_out": True}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": -1, "timed_out": False}
    finally:
        os.unlink(filepath)


def _execute_compiled(code: str, language: str, lang: dict[str, Any], stdin: str, timeout: int) -> dict[str, Any]:
    tmpdir = tempfile.mkdtemp()
    try:
        if language == "java":
            return _execute_java(code, tmpdir, stdin, timeout)
        return _execute_c_cpp(code, language, lang, tmpdir, stdin, timeout)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _execute_c_cpp(code: str, language: str, lang: dict[str, Any], tmpdir: str, stdin: str, timeout: int) -> dict[str, Any]:
    src_path = os.path.join(tmpdir, f"solution{lang['ext']}")
    bin_path = os.path.join(tmpdir, "solution")
    with open(src_path, "w", encoding="utf-8") as f:
        f.write(code)
    compile_cmd = lang["compile_cmd"] + [bin_path, src_path]
    if language == "c":
        compile_cmd.append("-lm")
    try:
        comp = subprocess.run(compile_cmd, capture_output=True, text=True, timeout=30, env=_exec_env())
        if comp.returncode != 0:
            return {
                "stdout": "",
                "stderr": f"Compilation error:\n{comp.stderr[:MAX_OUTPUT_LEN]}",
                "exit_code": comp.returncode,
                "timed_out": False,
            }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Compilation timed out", "exit_code": -1, "timed_out": True}
    except FileNotFoundError:
        return {"stdout": "", "stderr": f"Compiler '{lang['compile_cmd'][0]}' not found", "exit_code": -1, "timed_out": False}
    try:
        result = subprocess.run([bin_path], input=stdin, capture_output=True, text=True, timeout=timeout, env=_exec_env())
        return {
            "stdout": result.stdout[:MAX_OUTPUT_LEN],
            "stderr": result.stderr[:MAX_OUTPUT_LEN],
            "exit_code": result.returncode,
            "timed_out": False,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out", "exit_code": -1, "timed_out": True}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": -1, "timed_out": False}


def _execute_java(code: str, tmpdir: str, stdin: str, timeout: int) -> dict[str, Any]:
    class_match = re.search(r"public\s+class\s+(\w+)", code)
    class_name = class_match.group(1) if class_match else "Solution"
    src_path = os.path.join(tmpdir, f"{class_name}.java")
    with open(src_path, "w", encoding="utf-8") as f:
        f.write(code)
    try:
        comp = subprocess.run(["javac", src_path], capture_output=True, text=True, timeout=30, env=_exec_env())
        if comp.returncode != 0:
            return {
                "stdout": "",
                "stderr": f"Compilation error:\n{comp.stderr[:MAX_OUTPUT_LEN]}",
                "exit_code": comp.returncode,
                "timed_out": False,
            }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Compilation timed out", "exit_code": -1, "timed_out": True}
    except FileNotFoundError:
        return {"stdout": "", "stderr": "Java compiler 'javac' not found", "exit_code": -1, "timed_out": False}
    try:
        result = subprocess.run(["java", "-cp", tmpdir, class_name], input=stdin, capture_output=True, text=True, timeout=timeout, env=_exec_env())
        return {
            "stdout": result.stdout[:MAX_OUTPUT_LEN],
            "stderr": result.stderr[:MAX_OUTPUT_LEN],
            "exit_code": result.returncode,
            "timed_out": False,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out", "exit_code": -1, "timed_out": True}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": -1, "timed_out": False}


def _normalize_output(text: str) -> str:
    lines = [line.rstrip() for line in text.strip().splitlines()]
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _wrap_function_code(code: str, language: str) -> str:
    if language != "python":
        return code
    if "input(" in code or "sys.stdin" in code:
        return code
    func_match = re.search(r"^def\s+(\w+)\s*\(", code, re.MULTILINE)
    if not func_match:
        return code
    func_name = func_match.group(1)
    for line in code.split("\n"):
        stripped = line.strip()
        if stripped.startswith(("def ", "#", "class ")):
            continue
        if re.search(rf"\b{func_name}\s*\(", stripped):
            return code
    wrapper = f"""
import sys as _sys
_raw_input = _sys.stdin.read().strip()
if _raw_input:
    _result = eval(f"{func_name}({{_raw_input}})")
    print(_result)
"""
    return code + "\n" + wrapper


def _wrap_js_function_code(code: str) -> str:
    if "process.stdin" in code or "readline" in code:
        return code
    func_match = re.search(r"^function\s+(\w+)\s*\(", code, re.MULTILINE)
    if not func_match:
        return code
    func_name = func_match.group(1)
    for line in code.split("\n"):
        stripped = line.strip()
        if stripped.startswith(("function ", "//", "class ")):
            continue
        if re.search(rf"\b{func_name}\s*\(", stripped):
            return code
    wrapper = f"""
const _chunks = [];
process.stdin.on('data', c => _chunks.push(c));
process.stdin.on('end', () => {{
  const _input = _chunks.join('').trim();
  if (_input) {{
    const _parts = [];
    let _depth = 0, _cur = '';
    for (const ch of _input) {{
      if ('([{{'.includes(ch)) {{ _depth++; _cur += ch; }}
      else if (')]}}'.includes(ch)) {{ _depth--; _cur += ch; }}
      else if (ch === ',' && _depth === 0) {{ _parts.push(_cur.trim()); _cur = ''; }}
      else {{ _cur += ch; }}
    }}
    if (_cur.trim()) _parts.push(_cur.trim());
    const _args = _parts.map(p => {{
      const eq = p.indexOf('=');
      return eq > 0 ? p.slice(eq + 1).trim() : p.trim();
    }});
    const _result = {func_name}(..._args.map(a => eval(a)));
    console.log(Array.isArray(_result) ? JSON.stringify(_result) : String(_result));
  }}
}});
"""
    return code + "\n" + wrapper


def run_test_cases(code: str, test_cases: list[dict[str, str]], language: str = "python") -> list[dict[str, Any]]:
    if language == "python":
        wrapped_code = _wrap_function_code(code, language)
    elif language == "javascript":
        wrapped_code = _wrap_js_function_code(code)
    else:
        wrapped_code = code
    results = []
    for tc in test_cases:
        stdin_input = str(tc.get("input", ""))
        expected = _normalize_output(str(tc.get("expected") or tc.get("expected_output") or ""))
        result = execute_code(wrapped_code, language, stdin=stdin_input)
        actual = _normalize_output(result["stdout"])
        results.append({
            "input": stdin_input,
            "expected": expected,
            "actual": actual,
            "passed": actual == expected,
            "error": result["stderr"] or None,
            "timed_out": result["timed_out"],
        })
    return results


def run_code_against_tests(
    source_code: str,
    language: str,
    test_cases: list[dict[str, str]],
) -> ExecutionResult:
    """
    Run source_code against a list of test cases.
    Each test_case has 'input' and 'expected' keys.
    Returns per-test results with pass/fail.
    """
    result = ExecutionResult(total=len(test_cases))
    run_results = run_test_cases(source_code, test_cases, language or "python")
    for row in run_results:
        if row["passed"]:
            result.passed += 1
        else:
            result.failed += 1
        result.results.append(row)
    return result
