r"""Extract dataset archive into the repo `data/` folder and optionally convert pickles to CSV

Usage (PowerShell):
  $env:PYTHONHASHSEED='0'
  py -3 scripts\extract_and_prepare.py --archive railway-opendata.7z --convert --analyze \
      --start-date 2025-03-27 --end-date 2025-10-26

By default the script will try to use the repo venv python at `.venv\Scripts\python.exe`.
If that executable is not found it falls back to the current Python interpreter.

The script supports .7z (using py7zr), .zip (shutil), and will try to call 7z.exe if available.
"""
from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable


DEFAULT_ARCHIVE = Path("railway-opendata.7z")
REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
DEFAULT_VENV_PY = REPO_ROOT / ".venv" / "Scripts" / "python.exe"


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def install_py7zr(python_exe: Path) -> None:
    logging.info("Installing py7zr into venv (needed to extract .7z)...")
    subprocess.run([str(python_exe), "-m", "pip", "install", "py7zr"], check=True)


def extract_7z(archive: Path, dest: Path, python_exe: Path) -> None:
    # Try to perform extraction using the specified python executable so
    # that py7zr is resolved from the venv/site-packages belonging to that
    # interpreter. This avoids import issues in the current running
    # interpreter.
    extract_script = (
        "import py7zr\n"
        "from pathlib import Path\n"
        f"archive=Path(r'{archive}')\n"
        f"dest=Path(r'{dest}')\n"
        "with py7zr.SevenZipFile(archive, mode='r') as z:\n"
        "    z.extractall(path=str(dest))\n"
    )
    extract_cmd = [str(python_exe), "-c", extract_script]

    try:
        logging.info("Attempting to extract with python executable: %s", python_exe)
        subprocess.run(extract_cmd, check=True)
        return
    except subprocess.CalledProcessError:
        logging.info("py7zr not available in %s or extraction failed, attempting to install py7zr into that python", python_exe)
        try:
            install_py7zr(python_exe)
            subprocess.run(extract_cmd, check=True)
            return
        except subprocess.CalledProcessError as e:
            logging.error("Extraction with py7zr via python_exe failed: %s", e)
            raise


def extract_zip(archive: Path, dest: Path) -> None:
    logging.info("Using shutil.unpack_archive to extract %s -> %s", archive, dest)
    shutil.unpack_archive(str(archive), str(dest))


def call_7z_exe(archive: Path, dest: Path) -> bool:
    # Prefer a 7z on PATH, otherwise check the default install location.
    exe_path = shutil.which("7z")
    if not exe_path:
        default = Path(r"C:\Program Files\7-Zip\7z.exe")
        exe_path = str(default) if default.exists() else None

    if not exe_path:
        logging.info("7z.exe not found on PATH or default location")
        return False

    logging.info("Using 7z.exe at %s", exe_path)
    try:
        subprocess.run([exe_path, "x", str(archive), f"-o{str(dest)}", "-y"], check=True)
        return True
    except subprocess.CalledProcessError as e:
        logging.error("7z.exe extraction failed: %s", e)
        return False


def extract_archive(archive: Path, dest: Path, python_exe: Path) -> None:
    logging.info("Extracting archive %s into %s", archive, dest)
    ensure_dir(dest)
    suffix = archive.suffix.lower()
    if suffix == ".7z":
        try:
            extract_7z(archive, dest, python_exe)
            return
        except Exception as e:
            logging.error("py7zr extraction failed: %s", e)
            # try external 7z
            if call_7z_exe(archive, dest):
                return
            raise
    elif suffix == ".zip":
        extract_zip(archive, dest)
    else:
        # try py7zr for unknown archives (py7zr supports several formats)
        try:
            extract_7z(archive, dest, python_exe)
        except Exception as e:
            logging.error("Unsupported archive type: %s", e)
            raise


def find_trains_pickles(data_dir: Path) -> Iterable[Path]:
    for p in data_dir.rglob("trains.pickle"):
        yield p


def convert_pickles(python_exe: Path, data_dir: Path) -> None:
    # stations.pickle -> stations.csv
    stations_pickle = data_dir / "stations.pickle"
    if stations_pickle.exists():
        out = data_dir / "stations.csv"
        logging.info("Converting %s -> %s", stations_pickle, out)
        subprocess.run([str(python_exe), str(REPO_ROOT / "main.py"), "station-extractor", str(stations_pickle), "-f", "csv", "-o", str(out)], check=True)
    else:
        logging.warning("stations.pickle not found at %s", stations_pickle)

    # convert all trains pickles
    n = 0
    for p in find_trains_pickles(data_dir):
        out = p.with_suffix(".csv")
        logging.info("Converting %s -> %s", p, out)
        subprocess.run([str(python_exe), str(REPO_ROOT / "main.py"), "train-extractor", str(p), "-o", str(out)], check=True)
        n += 1
    logging.info("Converted %d trains.pickle files", n)


def run_analyzer(python_exe: Path, stations_csv: Path, train_csv_pattern: str, start_date: str, end_date: str, outputs_dir: Path) -> None:
    ensure_dir(outputs_dir)
    # describe
    logging.info("Running analyzer describe for %s -> %s", start_date, end_date)
    subprocess.run([str(python_exe), str(REPO_ROOT / "main.py"), "analyze", "--start-date", start_date, "--end-date", end_date, str(stations_csv), train_csv_pattern, "--stat", "describe"], check=True)

    # delay_boxplot
    out_png = outputs_dir / "delay_boxplot.png"
    logging.info("Running analyzer delay_boxplot and saving to %s", out_png)
    subprocess.run([str(python_exe), str(REPO_ROOT / "main.py"), "analyze", "--start-date", start_date, "--end-date", end_date, str(stations_csv), train_csv_pattern, "--stat", "delay_boxplot", "--save-fig", str(out_png)], check=True)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE, help="path to the dataset archive (.7z or .zip)")
    parser.add_argument("--dest", type=Path, default=DATA_DIR, help="destination data directory")
    parser.add_argument("--convert", action="store_true", help="convert pickles to CSV after extraction")
    parser.add_argument("--analyze", action="store_true", help="run analyzer after conversion")
    parser.add_argument("--start-date", default="2025-03-27", help="analyzer start date (if --analyze)")
    parser.add_argument("--end-date", default="2025-10-26", help="analyzer end date (if --analyze)")
    parser.add_argument("--python", type=Path, default=DEFAULT_VENV_PY, help="python executable to use for conversions (defaults to .venv\\Scripts\\python.exe)")
    args = parser.parse_args(argv)

    archive = args.archive
    dest = args.dest
    python_exe = args.python if args.python.exists() else Path(sys.executable)

    logging.info("Repo root: %s", REPO_ROOT)
    logging.info("Using python: %s", python_exe)

    if not archive.exists():
        logging.error("Archive not found: %s", archive)
        return 2

    try:
        extract_archive(archive, dest, python_exe)
    except Exception as e:
        logging.exception("Extraction failed: %s", e)
        return 3

    # basic verification
    stations = dest / "stations.pickle"
    pickles = list(find_trains_pickles(dest))
    logging.info("Post-extraction: stations.pickle exists=%s; trains.pickle count=%d", stations.exists(), len(pickles))

    if args.convert:
        try:
            convert_pickles(python_exe, dest)
        except subprocess.CalledProcessError as e:
            logging.exception("Conversion failed: %s", e)
            return 4

    if args.analyze:
        stations_csv = dest / "stations.csv"
        if not stations_csv.exists():
            logging.error("stations.csv not found; run with --convert or create stations.csv first")
            return 5
        train_pattern = str(dest / "2025-*/trains.csv")
        try:
            run_analyzer(python_exe, stations_csv, train_pattern, args.start_date, args.end_date, dest / "outputs")
        except subprocess.CalledProcessError as e:
            logging.exception("Analyzer failed: %s", e)
            return 6

    logging.info("All done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
