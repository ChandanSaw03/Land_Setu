import math
import unittest

from train_landportal_lcw import DEFAULT_DATASET, load_dataset, predict, train_and_evaluate


class LandPortalLcwTrainingTests(unittest.TestCase):
    def test_dataset_keeps_only_reported_observations(self):
        observations = load_dataset(DEFAULT_DATASET)

        self.assertEqual(len(observations), 60)
        self.assertEqual(observations[0], (1912, 1))
        self.assertEqual(observations[-1], (2018, 25))
        self.assertNotIn(1913, {year for year, _ in observations})

    def test_temporal_holdout_and_final_model_are_valid(self):
        observations = load_dataset(DEFAULT_DATASET)
        model, report = train_and_evaluate(observations)
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


if __name__ == "__main__":
    unittest.main()
