import math
import unittest

from train_landportal_lcw import (
    DEFAULT_DATASET,
    DEFAULT_INVESTMENT_DATASET,
    load_dataset,
    load_investment_dataset,
    predict,
    train_and_evaluate,
)


class LandPortalLcwTrainingTests(unittest.TestCase):
    def test_dataset_keeps_only_reported_observations(self):
        observations = load_dataset(DEFAULT_DATASET)

        self.assertEqual(len(observations), 60)
        self.assertEqual(observations[0], (1912, 1))
        self.assertEqual(observations[-1], (2018, 25))
        self.assertNotIn(1913, {year for year, _ in observations})

    def test_temporal_holdout_and_final_model_are_valid(self):
        observations = load_dataset(DEFAULT_DATASET)
        investments = load_investment_dataset(DEFAULT_INVESTMENT_DATASET)
        model, report = train_and_evaluate(observations, investments)
        validation = report["validation"]

        self.assertEqual(validation["method"], "chronological holdout; final 20% of observed records")
        self.assertLess(validation["test_year_range"][0], validation["test_year_range"][1])
        self.assertEqual(validation["test_records"], 12)
        self.assertEqual(model["training_records"], 60)
        self.assertTrue(math.isfinite(validation["model"]["mae"]))
        self.assertLess(
            validation["model"]["mae"],
            validation["last_observation_baseline"]["mae"],
        )
        self.assertGreaterEqual(predict(model, 2019), 0)
        self.assertEqual(report["missing_years_not_imputed"], 47)

    def test_investment_series_is_reported_as_context_not_a_feature(self):
        observations = load_dataset(DEFAULT_DATASET)
        investments = load_investment_dataset(DEFAULT_INVESTMENT_DATASET)
        _, report = train_and_evaluate(observations, investments)
        context = report["related_investment_indicator"]

        self.assertEqual(len(investments), 40)
        self.assertEqual(context["paired_years_with_conflict_counts"], 40)
        self.assertAlmostEqual(context["paired_year_pearson_correlation"], 0.9068, places=3)
        self.assertIn("not used as a model feature", context["model_use"])
        self.assertIn("nominal", context["unit"])


if __name__ == "__main__":
    unittest.main()
