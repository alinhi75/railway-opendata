# STEP 1 Completion Report: Analyzer User Stories & Work Progress

**Student:** Sayedali Noohi (S327132)  
**Supervisor:** Prof. Antonio Vetrò  
**Project:** Open Data Web Application for Italian Railway Performance  
**Date:** December 9, 2025  

---

## Executive Summary

Since the kick-off meeting on November 5, 2025, I have completed **STEP 0** (understanding the pipeline and running the analyzer) and now present **STEP 1**: a complete set of user stories documenting all existing analyzer functionalities. This document demonstrates the work completed, shows my understanding of the system, and provides the foundation for the web application implementation (STEP 2).

**Key Achievements:**
- ✅ Successfully set up and validated the complete pipeline
- ✅ Analyzed 7 months of data (March-October 2025: ~27.8M train stops)
- ✅ Created 6 memory-efficient helper scripts for large-scale analysis
- ✅ Documented 13 user stories covering all analyzer capabilities
- ✅ Generated statistical outputs and visualizations for presentation

---


## 1. Timeline & Work Progress

### November 5, 2025 - Kick-off Meeting
**Assigned Tasks:**
- STEP 0: Understand pipeline, data formats, run Docker and analyzer
- STEP 1: Translate analyzer functionalities into user stories (this document)
- STEP 2: Implement web application (pending approval)

### November 5 - December 9, 2025 - Work Completed

**Environment Setup & Pipeline Understanding**
- Downloaded and extracted dataset (~1GB, 390 files covering Aug 2024 - Nov 2025)
- Set up Python virtual environment with all dependencies
- Validated Docker scraper functionality
- Studied codebase architecture (scraper, extractors, analyzer modules)
- Identified target period: **March 27 - October 26, 2025** (7 months, 172 files)

**Data Processing & Quality Issues**
- Converted pickles to CSV format (stations + sample trains)
- Discovered and fixed encoding issues in station data (UTF-8, CSV quoting)
- Created helper scripts to handle data cleaning automatically
- Validated data schema and field mappings

**Running Analyzer & Creating Outputs**
- Executed all analyzer statistics on the 7-month dataset
- Hit memory limitations with large dataset (27M+ records)
- Developed memory-efficient alternative scripts
- Generated all visualizations and saved outputs for review

**Current Status:** STEP 1 complete, ready for team review and feedback

---


## 2. What I Learned About the System

### 2.1 System Architecture
The railway-opendata project has three main components:

1. **Scraper** (validated via Docker)
   - Downloads live data from ViaggiaTreno and Trenord APIs every hour
   - Saves daily snapshots as `trains.pickle` and `stations.pickle`
   - Handles API errors with `phantom` flags for incomplete data

2. **Extractors** (successfully used)
   - Converts binary pickles to human-readable CSV and GeoJSON
   - Essential for data analysis with standard tools

3. **Analyzer** (fully tested and documented)
   - Six built-in statistics: describe, delay_boxplot, day_train_count, trajectories_map, detect_lines, timetable
   - Flexible filtering: by date, company, railway line
   - Outputs: console text, CSV/JSON files, PNG images, interactive HTML

### 2.2 Dataset Overview

**Available Data (provided archive):**
- **Period**: August 16, 2024 → November 26, 2025 (with gap Dec 2024 - Mar 2025)
- **Target Period**: March 27 - October 26, 2025 (7 months as suggested)
- **Scale**: 172 daily files, ~27.8 million train stop records
- **Stations**: 3,357 Italian railway stations with coordinates
- **Companies**: Trenitalia (high-speed, intercity, regional), Trenord, TPER, ÖBB

**Data Quality:**
- ✅ Station data: complete with GPS coordinates
- ⚠️ Train data: ~5-10% marked as "phantom" (incomplete API responses)
- ⚠️ Timing data: some missing actual arrival/departure times
- ⚠️ Crowding data: only available for Trenord trains (~20% coverage)

### 2.3 Technical Challenges I Solved

**Challenge 1: Memory Limitations**
- **Problem**: Loading 27M records crashes on typical hardware (8GB RAM)
- **Solution**: Created 6 helper scripts that process files one-by-one and aggregate results
- **Impact**: Can now analyze full dataset on standard laptop

**Challenge 2: Station CSV Encoding**
- **Problem**: Station names with commas (e.g., "P.M. Km. 5,420") broke CSV parsing
- **Solution**: Built cleaning script with proper UTF-8 encoding and CSV quoting
- **Impact**: All 3,357 stations now load correctly

**Challenge 3: Interactive Map Memory**
- **Problem**: Full week trajectory map (55k trains) causes out-of-memory error
- **Solution**: Implemented 10% random sampling for visualization
- **Impact**: Generated working interactive map in ~25 seconds

---
### 3 Outputs Generated

All outputs saved in `data/outputs/` folder:

| File | Description | Period |
|------|-------------|--------|
| `describe_2023-05-01_2025-12-01.csv` | Statistical summary (count, mean, std, quartiles) | Full dataset |
| `delay_boxplot_2025-03-27_2025-10-26_fast.png` | Last-stop delay distribution visualization | 7 months |
| `day_train_count_2025-03-27_2025-10-26.png` | Daily train volume by company | 7 months |
| `trajectories_map_sample.html` | Interactive animated map (sample week) | Mar 27 - Apr 2 |

---

## 4. USER STORIES: Existing Analyzer Functionalities

*These user stories document what the current analyzer can do. The web application (STEP 2) will implement these features with a user-friendly interface.*

### 4.1 Data Collection & Preparation

### 4.1 Data Collection & Preparation

#### US-1: Scrape Railway Data
**As a** system administrator  
**I want to** automatically collect current train status from APIs  
**So that** the dataset grows continuously with fresh data

**What it does:**
- Connects to ViaggiaTreno and Trenord APIs
- Downloads status for all active trains and stations
- Saves daily snapshots as pickle files
- Runs hourly via scheduler (cron/Docker)

**Status:** ✅ Tested via Docker  
**Command:** `python main.py scraper` or `docker run ghcr.io/marcobuster/railway-opendata:latest scraper`

---

#### US-2: Convert Pickles to CSV
**As a** data analyst  
**I want to** convert binary pickle files to readable CSV format  
**So that** I can analyze data with Excel, pandas, or SQL

**What it does:**
- Reads `trains.pickle` → outputs `trains.csv` (one file per day)
- Reads `stations.pickle` → outputs `stations.csv` (station metadata)
- Each train CSV contains stop-level records (21 fields per row)

**Status:** ✅ Working, tested on 172 files  
**Command:** `python main.py train-extractor data/YYYY-MM-DD/trains.pickle -o data/YYYY-MM-DD/trains.csv`

---

#### US-3: Export Stations to GeoJSON
**As a** GIS analyst or web developer  
**I want to** export station locations as GeoJSON  
**So that** I can display them on interactive maps

**What it does:**
- Converts `stations.pickle` to GeoJSON format
- Includes coordinates (latitude, longitude) for 3,357 stations
- Compatible with Leaflet, Folium, Mapbox, etc.

**Status:** ✅ Tested and validated  
**Command:** `python main.py station-extractor -f geojson data/stations.pickle -o data/stations.geojson`

---

### 4.2 Statistical Analysis

#### US-4: Compute Descriptive Statistics
**As a** researcher  
**I want to** see summary statistics for delays and train performance  
**So that** I can understand overall patterns in the dataset

**What it does:**
- Computes count, mean, std deviation, min, quartiles (25%, 50%, 75%), max
- Analyzes: stop numbers, arrival delays, departure delays, crowding
- Filters by date range (--start-date, --end-date)
- Outputs to console or saves as CSV/JSON

**Status:** ✅ Implemented (memory-efficient version)  
**Command:** `python scripts/save_describe.py --start 2025-03-27 --end 2025-10-26`  
**Runtime:** ~5 minutes for 390 files

---

#### US-5: Visualize Delay Distribution
**As a** operations analyst  
**I want to** see a boxplot of train delays  
**So that** I can identify typical delays vs outliers

**What it does:**
- Creates boxplot showing delay distribution (arrival + departure)
- Groups by train (last stop delays)
- Shows median, quartiles, and whiskers
- Saves as PNG image

**Status:** ✅ Memory-efficient version created  
**Command:** `python scripts/delay_boxplot_fast.py --start 2025-03-27 --end 2025-10-26 --out output.png`  
**Runtime:** ~2 minutes for 172 files

---

#### US-6: Daily Train Count by Company
**As a** network planner  
**I want to** see how many trains each company operates per day  
**So that** I can understand market share and capacity

**What it does:**
- Counts unique trains per day
- Groups by railway company (Trenitalia, Trenord, TPER, etc.)
- Generates grouped bar chart
- Shows trends over time

**Status:** ✅ Memory-efficient version created  
**Command:** `python scripts/day_train_count_fast.py --start 2025-03-27 --end 2025-10-26 --out output.png`  
**Runtime:** ~1 minute for 172 files

---

### 4.3 Advanced Visualizations

#### US-7: Interactive Trajectory Map
**As a** transportation researcher  
**I want to** see an animated map of train movements over time  
**So that** I can visualize network traffic patterns and delays geographically

**What it does:**
- Creates interactive Folium HTML map
- Shows train trajectories as animated lines with time slider
- Color-codes delays (green=on-time, orange=late, red=very late)
- Line thickness represents crowding level
- Tooltips show train details on hover
- Includes railway company markers and delay charts
- Opens in web browser

**Status:** ✅ Working with 10% sampling for memory efficiency  
**Command:** `python scripts/run_trajectories_week_sample.py --start 2025-03-27 --end 2025-04-02 --sample 0.1`  
**Runtime:** ~25 seconds for 1 week (10% sample)  
**Note:** Full dataset requires more RAM; sampling recommended

---

#### US-8: Detect Railway Lines
**As a** network analyst  
**I want to** identify distinct railway lines from the data  
**So that** I can analyze routes and their performance separately

**What it does:**
- Groups trains by company, origin-destination, and stop sequence
- Identifies unique lines (bidirectional routes)
- Displays interactive HTML table with:
  - Line ID
  - Terminal stations (A ↔ B)
  - Number of trains on that line
  - Average stops per journey
- Sortable and filterable table

**Status:** ✅ Available in main analyzer  
**Command:** `python main.py analyze data/stations.csv data/**/trains.csv --stat detect_lines`

---

#### US-9: Display Timetable Graph
**As a** operations analyst  
**I want to** see a graphical timetable for a specific railway line  
**So that** I can analyze train frequency and identify scheduling patterns

**What it does:**
- Creates time-distance graph for selected line
- X-axis: time of day
- Y-axis: station sequence along the route
- Each line represents one train journey
- Option to collapse times for pattern visualization
- Saves as PNG or displays interactively

**Status:** ✅ Available in main analyzer  
**Command:** `python main.py analyze --railway-lines <line_id> data/stations.csv data/**/trains.csv --stat timetable --save-fig output.png`  
**Prerequisite:** Run US-8 (detect_lines) first to get line IDs

---

### 4.4 Filtering Capabilities

#### US-10: Filter by Date Range
**As a** user of any analysis function  
**I want to** specify start and end dates  
**So that** I can focus analysis on specific time periods (seasons, incidents, etc.)

**What it does:**
- Accepts --start-date and --end-date parameters
- Supports ISO format (YYYY-MM-DD) or keyword "today"
- Applies to all analysis functions

**Status:** ✅ Implemented across all commands  
**Example:** `--start-date 2025-03-27 --end-date 2025-10-26`

---

#### US-11: Filter by Railway Company
**As a** analyst or regulator  
**I want to** filter by specific railway operators  
**So that** I can compare performance between companies

**What it does:**
- Accepts --railway-companies parameter (comma-separated list)
- Filters by client_code before analysis
- Valid values: TRENITALIA_REG, TRENITALIA_AV, TRENORD, TPER, etc.

**Status:** ✅ Implemented in analyzer  
**Example:** `--railway-companies TRENITALIA_REG,TRENORD`

---

#### US-12: Filter by Railway Line
**As a** route analyst  
**I want to** analyze a specific railway line  
**So that** I can study performance on particular routes

**What it does:**
- Accepts --railway-lines parameter (line IDs from US-8)
- Filters trains to specific routes
- Essential for timetable graphs (US-9)

**Status:** ✅ Implemented in analyzer  
**Example:** `--railway-lines 2_S01700_S01863_abc123`

---

#### US-13: Group and Aggregate Data
**As a** data analyst  
**I want to** group data by different dimensions and apply aggregation functions  
**So that** I can compute train-level or line-level statistics

**What it does:**
- Accepts --group-by parameter (train_hash, client_code, etc.)
- Accepts --agg-func parameter (last, first, mean, sum, etc.)
- Enables flexible analysis patterns
- Example: "last stop delay per train" = group by train_hash, aggregate with "last"

**Status:** ✅ Implemented in analyzer  
**Example:** `--group-by train_hash --agg-func last`

---


### 5 Helper Scripts Created

During testing, I created 6 memory-efficient scripts to handle large-scale analysis:

| Script | Purpose | Improvement |
|--------|---------|-------------|
| `batch_clean_stations.py` | Fix station CSV encoding | Automated cleaning |
| `save_describe.py` | Compute descriptive stats | Reads only needed columns (-60% memory) |
| `delay_boxplot_fast.py` | Generate delay visualization | Per-file processing (-50% memory) |
| `day_train_count_fast.py` | Count trains by company | Per-file processing (-50% memory) |
| `run_trajectories_week_sample.py` | Build interactive map | 10% sampling (-90% memory) |
| `extract_and_prepare.py` | Batch convert pickles to CSV | Automated workflow |

**All scripts are production-ready and can be integrated into the web application.**

---

## 6. Recommendations for STEP 2 (Web Application)

Based on my work with the analyzer, here are my suggestions for the web implementation:

### 6.1 Priority Features (Must-Have)
1. **Date range selector** → Enable US-10
1. **Date range selector** → Enable US-10
2. **Company filter** → Enable US-11  
3. **Descriptive statistics dashboard** → Implement US-4 with charts
4. **Delay distribution visualization** → Implement US-5 interactively
5. **Daily train count chart** → Implement US-6 with date slider

### 6.2 Advanced Features (Should-Have)
6. **Interactive trajectory map** → Implement US-7 with controls
7. **Line detection tool** → Implement US-8 with search/filter
8. **Line-specific timetable** → Implement US-9 after US-8

### 6.3 Technical Considerations
- **Memory management**: Use the helper scripts I created, not main analyzer
- **Asynchronous processing**: Long operations (describe, maps) should run in background
- **Caching**: Cache results for common queries (e.g., last month statistics)
- **Responsive design**: Mobile-friendly for commuters checking delays
- **Export capabilities**: Allow users to download CSV, PNG, HTML outputs

### 6.4 Proposed Technology Stack
Based on my experience:
- **Backend**: Python (Flask/FastAPI) + helper scripts
- **Frontend**: Vue.js or React
- **Maps**: Folium (Python) or Leaflet.js (JavaScript)
- **Charts**: Plotly.js or Chart.js for interactive visualizations
- **Database**: PostgreSQL for storing analysis cache (optional)

---