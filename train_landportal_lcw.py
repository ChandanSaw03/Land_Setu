#!/usr/bin/env python3
"""Train and evaluate a time-trend model for Land Conflict Watch counts."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Any


DEFAULT_DATASET = Path(__file__).with_name("landportal-LCW-LCI-NOCONF.csv")
DEFAULT_INVESTMENT_DATASET = Path(__file__).with_name("landportal-LCW-LCI-VALINV.csv")
DEFAULT_MODEL = Path(__file__).with_name("landportal-lcw-model.json")
DEFAULT_REPORT = Path(__file__).with_name("landportal-lcw-evaluation.json")
INDICATOR_CODE = "LCW-LCI-NOCONF"
INVESTMENT_INDICATOR_CODE = "LCW-LCI-VALINV"
POLYNOMIAL_DEGREE = 3
RIDGE_ALPHA = 1e-6
HOLDOUT_FRACTION = 0.2


def load_dataset(path: Path) -> list[tuple[int, int]]:
    """Read observed India count records; missing years are not imputed."""
    with path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source, delimiter=";")
        required = {"indicator", "country", "time", "value"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"Dataset must contain these columns: {', '.join(sorted(required))}")

        observations: list[tuple[int, int]] = []
        seen_years: set[int] = set()
        for line, row in enumerate(reader, start=2):
            if row["indicator"] != INDICATOR_CODE or row["country"] != "IND":
                raise ValueError(f"Unexpected indicator or country on CSV line {line}.")
            try:
                year = int(row["time"])
                count = int(row["value"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Year and count must be integers on CSV line {line}.") from error
            if year in seen_years:
                raise ValueError(f"Duplicate year {year} on CSV line {line}.")
            if count < 0:
                raise ValueError(f"Conflict count cannot be negative on CSV line {line}.")
            seen_years.add(year)
            observations.append((year, count))

    observations.sort()
    if len(observations) < 20:
        raise ValueError("At least 20 observed records are required for a chronological holdout.")
    return observations


def load_investment_dataset(path: Path) -> list[tuple[int, float]]:
    """Read observed India investment values associated with reported conflicts."""
    with path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source, delimiter=";")
        required = {"indicator", "country", "time", "value"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"Dataset must contain these columns: {', '.join(sorted(required))}")

        observations: list[tuple[int, float]] = []
        seen_years: set[int] = set()
        for line, row in enumerate(reader, start=2):
            if row["indicator"] != INVESTMENT_INDICATOR_CODE or row["country"] != "IND":
                raise ValueError(f"Unexpected indicator or country on CSV line {line}.")
            try:
                year = int(row["time"])
                value = float(row["value"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Year and investment value must be numeric on CSV line {line}.") from error
            if year in seen_years:
                raise ValueError(f"Duplicate year {year} on CSV line {line}.")
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"Investment value must be finite and nonnegative on CSV line {line}.")
            seen_years.add(year)
            observations.append((year, value))

    observations.sort()
    if len(observations) < 2:
        raise ValueError("At least two investment observations are required for comparison.")
    return observations


def _pearson_correlation(left: list[float], right: list[float]) -> float | None:
    if len(left) != len(right) or len(left) < 2:
        return None
    left_mean = sum(left) / len(left)
    right_mean = sum(right) / len(right)
    left_centered = [value - left_mean for value in left]
    right_centered = [value - right_mean for value in right]
    left_sum_squares = sum(value * value for value in left_centered)
    right_sum_squares = sum(value * value for value in right_centered)
    if left_sum_squares == 0 or right_sum_squares == 0:
        return None
    covariance = sum(a * b for a, b in zip(left_centered, right_centered))
    return covariance / math.sqrt(left_sum_squares * right_sum_squares)


def investment_context(
    observations: list[tuple[int, int]],
    investments: list[tuple[int, float]],
) -> dict[str, Any]:
    """Summarize paired LCW indicators without using contemporaneous values to predict."""
    count_by_year = dict(observations)
    investment_by_year = dict(investments)
    shared_years = sorted(count_by_year.keys() & investment_by_year.keys())
    counts = [float(count_by_year[year]) for year in shared_years]
    values = [investment_by_year[year] for year in shared_years]
    return {
        "indicator": INVESTMENT_INDICATOR_CODE,
        "description": "Total investment value related to reported land conflicts",
        "unit": "Indian Rs crore (nominal; not inflation-adjusted)",
        "observed_records": len(investments),
        "observed_year_range": [investments[0][0], investments[-1][0]],
        "paired_years_with_conflict_counts": len(shared_years),
        "paired_year_range": [shared_years[0], shared_years[-1]] if shared_years else [],
        "investment_value_range": [min(values), max(values)] if values else [],
        "paired_year_pearson_correlation": _pearson_correlation(counts, values),
        "paired_year_log1p_pearson_correlation": _pearson_correlation(
            [math.log1p(value) for value in counts],
            [math.log1p(value) for value in values],
        ),
        "model_use": "Descriptive context only; not used as a model feature or project-delay predictor.",
        "limitations": [
            "Investment values are nominal and not inflation-adjusted.",
            "The indicators are same-year national aggregates; correlation does not establish cause or forecast value.",
        ],
    }


def _solve(matrix: list[list[float]], vector: list[float]) -> list[float]:
    """Solve a small dense linear system with partial pivoting."""
    size = len(vector)
    augmented = [row[:] + [vector[index]] for index, row in enumerate(matrix)]
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            raise ValueError("Training data does not support a stable polynomial fit.")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        augmented[column] = [value / divisor for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            augmented[row] = [
                value - factor * pivot_value
                for value, pivot_value in zip(augmented[row], augmented[column])
            ]
    return [augmented[index][-1] for index in range(size)]


def _features(year: int, center: float, scale: float, degree: int) -> list[float]:
    x = (year - center) / scale
    return [x**power for power in range(degree + 1)]


def fit_model(
    observations: list[tuple[int, int]],
    degree: int = POLYNOMIAL_DEGREE,
    alpha: float = RIDGE_ALPHA,
) -> dict[str, Any]:
    if len(observations) <= degree + 1:
        raise ValueError("There are too few observations for the selected polynomial degree.")
    years = [year for year, _ in observations]
    center = sum(years) / len(years)
    scale = max(abs(year - center) for year in years)
    if scale == 0:
        raise ValueError("Training years must not all be identical.")

    feature_rows = [_features(year, center, scale, degree) for year, _ in observations]
    targets = [math.log1p(count) for _, count in observations]
    width = degree + 1
    gram = [
        [
            sum(row[left] * row[right] for row in feature_rows)
            + (alpha if left == right and left > 0 else 0)
            for right in range(width)
        ]
        for left in range(width)
    ]
    products = [
        sum(row[index] * target for row, target in zip(feature_rows, targets))
        for index in range(width)
    ]
    coefficients = _solve(gram, products)
    return {
        "degree": degree,
        "alpha": alpha,
        "center_year": center,
        "scale_years": scale,
        "coefficients": coefficients,
    }


def predict(model: dict[str, Any], year: int) -> float:
    row = _features(
        year,
        model["center_year"],
        model["scale_years"],
        model["degree"],
    )
    log_count = sum(coefficient * feature for coefficient, feature in zip(model["coefficients"], row))
    return max(0.0, math.expm1(log_count))


def _metrics(actual: list[int], predicted: list[float]) -> dict[str, float]:
    errors = [prediction - observed for observed, prediction in zip(actual, predicted)]
    mae = sum(abs(error) for error in errors) / len(errors)
    rmse = math.sqrt(sum(error * error for error in errors) / len(errors))
    return {"mae": mae, "rmse": rmse}


def train_and_evaluate(
    observations: list[tuple[int, int]],
    investments: list[tuple[int, float]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    holdout_size = max(1, math.ceil(len(observations) * HOLDOUT_FRACTION))
    training = observations[:-holdout_size]
    holdout = observations[-holdout_size:]
    if len(training) < 20:
        raise ValueError("Chronological split leaves too few training observations.")

    validation_model = fit_model(training)
    actual = [count for _, count in holdout]
    predicted = [predict(validation_model, year) for year, _ in holdout]
    baseline_predictions = [float(training[-1][1])] * len(holdout)
    model_metrics = _metrics(actual, predicted)
    baseline_metrics = _metrics(actual, baseline_predictions)

    final_model = fit_model(observations)
    observed_years = {observed_year for observed_year, _ in observations}
    missing_years = [
        year
        for year in range(observations[0][0], observations[-1][0] + 1)
        if year not in observed_years
    ]
    artifact = {
        "model_type": "polynomial_ridge_regression",
        "target_transform": "log1p",
        "target": "reported_land_conflict_count",
        "indicator": INDICATOR_CODE,
        "country": "IND",
        "training_records": len(observations),
        "training_year_range": [observations[0][0], observations[-1][0]],
        **final_model,
        "intended_use": "Observed national conflict-count trend only; not project delay or acquisition risk.",
    }
    report = {
        "indicator": INDICATOR_CODE,
        "country": "India",
        "observed_records": len(observations),
        "observed_year_range": [observations[0][0], observations[-1][0]],
        "missing_years_not_imputed": len(missing_years),
        "related_investment_indicator": investment_context(observations, investments),
        "validation": {
            "method": "chronological holdout; final 20% of observed records",
            "training_records": len(training),
            "test_records": len(holdout),
            "test_year_range": [holdout[0][0], holdout[-1][0]],
            "model": model_metrics,
            "last_observation_baseline": baseline_metrics,
            "mae_improvement_over_baseline": (
                1 - model_metrics["mae"] / baseline_metrics["mae"]
                if baseline_metrics["mae"]
                else None
            ),
            "holdout_predictions": [
                {
                    "year": year,
                    "actual_count": count,
                    "predicted_count": prediction,
                }
                for (year, count), prediction in zip(holdout, predicted)
            ],
        },
        "limitations": [
            "The dataset has no project-level acquisition stages or delay outcomes.",
            "Absent calendar years are not treated as zero-count years.",
            "Reported conflict counts are not calibrated probabilities of land-acquisition delay.",
            "The latest observation is 2018; this model is historical and not a current forecast.",
        ],
    }
    return artifact, report


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--investment-dataset", type=Path, default=DEFAULT_INVESTMENT_DATASET)
    parser.add_argument("--model-output", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report-output", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()

    observations = load_dataset(args.dataset)
    investments = load_investment_dataset(args.investment_dataset)
    model, report = train_and_evaluate(observations, investments)
    write_json(args.model_output, model)
    write_json(args.report_output, report)
    validation = report["validation"]
    print(
        f"Trained on {model['training_records']} observed rows "
        f"({model['training_year_range'][0]}–{model['training_year_range'][1]})."
    )
    print(
        f"Chronological holdout MAE {validation['model']['mae']:.2f} "
        f"vs baseline {validation['last_observation_baseline']['mae']:.2f}."
    )
    context = report["related_investment_indicator"]
    correlation = context["paired_year_pearson_correlation"]
    print(
        f"Investment context: {context['observed_records']} records, "
        f"{context['paired_years_with_conflict_counts']} shared years, "
        f"Pearson r={correlation:.3f}; used as context only."
    )
    print(f"Model: {args.model_output}\nEvaluation: {args.report_output}")


if __name__ == "__main__":
    main()
