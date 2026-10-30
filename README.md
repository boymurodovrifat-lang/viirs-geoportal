# VIIRS Geoportal

Uzbekistan nighttime-light monitoring and frozen research analyses.

- Live application: https://ee-boymurodovrifat.projects.earthengine.app/view/viirs-geoportal
- Main application source: `gee/viirs_geoportal.js` (Google Earth Engine JavaScript).
- Offline replay: `code/reproduce.py`; environment: `requirements.txt`.
- Frozen derived diagnostics: `results/` (v13 scientific revision).

## Run the application

Paste the complete JavaScript into the Google Earth Engine Code Editor and run it in an Earth Engine enabled project. The source refers to the boundary and annual QA0 image assets by their explicit Earth Engine paths. Access to those assets is required. They are not distributed in this code repository. NASA source collection: `NASA/VIIRS/002/VNP46A2`.

The primary portal uses gap-filled radiance without the research QA0 filter. **Tahlillar** uses frozen 2020/2023 QA0 aggregates. It includes matched colour scales, coverage, threshold transitions, a 2024 tourism comparison, offline sensitivity diagnostics and limitations. Do not mix estimates from these workflows.

## Offline replay and scope

Run `python code/reproduce.py` from this directory after installing requirements and supplying the frozen inputs in `inputs/`: `background_v11.zip`, `geometry_v12.zip`, `VIIRS_QA0_2020_2023_native.tif` and `VIIRS_Support_Sensitivity_Summary_v05.csv` (use the exact filename required in the script). These large scientific inputs are not included in this repository. Consequently this source-only release does not by itself reproduce every manuscript result. The supplied CSVs are archived results, not independent validation measurements.

The replay verifies 42 upstream hashes, 384 cell-year reconstructions and observation counts. Its archived checks report maximum mean error 1.48e-8, zero count disagreement and 1,999 bootstrap replicates. This verifies computational consistency, not real-world accuracy. No independent nighttime field validation or exact A1/A2 granule matching is claimed. Earth Engine and local geodesic area totals remain different; the sensitivity view labels its calculation method explicitly.

Software implementation: Rifat Boymurodov. Scientific manuscript authorship and proposed CRediT roles are documented separately in the manuscript. No credentials are required or included. Third-party data and assets remain subject to their providers’ terms. Original software and accompanying derived tables are shared under the MIT licence; cite `CITATION.cff`. This licence does not relicense third-party data or Earth Engine assets.
