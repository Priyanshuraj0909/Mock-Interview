"""Run the real grading path against a small, inspectable starter dataset."""
import argparse
import asyncio
import json
from pathlib import Path
from time import perf_counter
from types import SimpleNamespace
from datetime import datetime, timezone

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field, StrictBool

from ai_service import configure_genai
from grading import grade_submission


class Case(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    role: str = "software-engineering"
    difficulty: str = "medium"
    question: str = Field(min_length=1)
    reference: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    expectedCorrect: StrictBool


def load_cases(path):
    cases = [Case.model_validate(item) for item in json.loads(path.read_text())]
    if not cases or len({case.id for case in cases}) != len(cases):
        raise ValueError("Evaluation case IDs must be nonempty and unique")
    return cases


async def evaluate(cases, runs):
    model = configure_genai()
    results = []
    # Bounded batches avoid truncating the provider's structured report.
    for run in range(runs):
        started = perf_counter()
        comparisons = []
        for offset in range(0, len(cases), 6):
            batch = cases[offset:offset + 6]
            submission = SimpleNamespace(
                testParams=SimpleNamespace(subject="Technical interview fundamentals", difficulty="medium"),
                questions=[{"id": i, "question": case.question, "correctAnswer": case.reference} for i, case in enumerate(batch, 1)],
                answers={str(i): case.answer for i, case in enumerate(batch, 1)},
            )
            report = await grade_submission(submission, model)
            verdicts = [item["correct"] for item in report["questionAnalysis"]]
            if len(verdicts) != len(batch):
                raise ValueError("Grader returned an incomplete report")
            comparisons.extend({"id": case.id, "role": case.role, "difficulty": case.difficulty,
                                "expected": case.expectedCorrect, "actual": verdict}
                               for case, verdict in zip(batch, verdicts))
        results.append({"run": run + 1, "latencySeconds": round(perf_counter() - started, 2),
                        "agreement": sum(item["expected"] == item["actual"] for item in comparisons) / len(cases),
                        "cases": comparisons})
    return {"caseCount": len(cases), "runs": results,
            "recordedAt": datetime.now(timezone.utc).isoformat(),
            "configuration": {"geminiModel": model.name if model.api_key else None,
                              "groqModels": model.groq_models if model.groq_key else []},
            "byRole": {role: {"cases": sum(c.role == role for c in cases),
                                "agreement": sum(item["expected"] == item["actual"] for run in results for item in run["cases"] if item["role"] == role) / (runs * sum(c.role == role for c in cases))}
                       for role in sorted({c.role for c in cases})},
            "note": "Synthetic starter examples; labels need independent human review. Not a comprehensive benchmark."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Call your configured AI provider (uses API credits).")
    parser.add_argument("--runs", type=int, choices=range(1, 6), default=1)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    load_dotenv(Path(__file__).parent / ".env")
    cases = load_cases(Path(__file__).parent / "evals/grading_cases.json")
    if not args.live:
        print(f"Validated {len(cases)} starter cases. Use --live to measure model agreement; no AI calls were made.")
        return
    result = asyncio.run(evaluate(cases, args.runs))
    text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n")
    print(text)
    if any(run["agreement"] < 0.9 for run in result["runs"]):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
