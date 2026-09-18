"""End-to-end pipeline test: real synthetic PDF bytes in, correct
Observation records out. This is the step-1 proof from the plan -- the
data model has to be right before any UI gets built on top of it.

Run: python -m pytest backend/tests  (or python tests/test_observations.py)
"""
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from app.pipeline.observations import build_observations
from tests.fixtures import make_sample_pdf


class TestBuildObservations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.obs_by_name = {
            o.raw_name: o for o in build_observations(make_sample_pdf(), source_doc_id="test-doc-1")
        }

    def test_all_rows_extracted(self):
        self.assertEqual(len(self.obs_by_name), 5)

    def test_normal_value_maps_and_flags_correctly(self):
        o = self.obs_by_name["GLUCOSE"]
        self.assertEqual(o.loinc_code, "2345-7")  # Glucose [Mass/Vol] in Ser/Plas
        self.assertEqual(o.mapping_stage, "exact")
        self.assertEqual(o.value, 95.0)
        self.assertEqual(o.unit, "mg/dL")
        self.assertEqual((o.ref_low, o.ref_high), (65.0, 99.0))
        self.assertEqual(o.flag, "normal")
        self.assertFalse(o.needs_review)

    def test_out_of_range_value_is_flagged_low(self):
        o = self.obs_by_name["FERRITIN, SERUM"]
        self.assertEqual(o.loinc_code, "2276-4")
        self.assertEqual(o.value, 18.0)
        self.assertEqual(o.flag, "low")
        self.assertFalse(o.needs_review)

    def test_unit_conversion_uses_the_audited_factor(self):
        # 80 umol/L * 0.0113 = 0.904 mg/dL -- the real published creatinine
        # conversion factor, not a made-up round number.
        o = self.obs_by_name["CREATININE"]
        self.assertEqual(o.loinc_code, "2160-0")
        self.assertAlmostEqual(o.value, 0.904, places=3)
        self.assertEqual(o.unit, "mg/dL")

    def test_creatinine_has_no_printed_range_and_no_sex_so_flag_is_unknown(self):
        # ranges.py's builtin fallback table for creatinine is sex-specific;
        # with no sex on this synthetic report it must not guess one --
        # unknown is the honest answer, not a coin flip.
        o = self.obs_by_name["CREATININE"]
        self.assertEqual((o.ref_low, o.ref_high), (None, None))
        self.assertEqual(o.flag, "unknown")

    def test_qualitative_result_has_no_numeric_value(self):
        o = self.obs_by_name["PROTEIN"]
        self.assertIsNone(o.value)
        self.assertEqual(o.qualitative_text, "NEGATIVE")

    def test_all_five_analytes_resolve_to_a_loinc_code(self):
        # Every name in this fixture is a common, exactly-printed analyte
        # name -- none of them should need the fuzzy stage or fall through
        # to needing review for mapping reasons.
        for name, o in self.obs_by_name.items():
            self.assertIsNotNone(o.loinc_code, f"{name} did not resolve to a LOINC code")
            self.assertEqual(o.mapping_stage, "exact", f"{name} did not resolve via exact match")


if __name__ == "__main__":
    unittest.main()
