"""Parses every command in the generated functions with the game's own command parser.

Runs the CmdCheck harness from the foxcraft-dungeon-loot-2 tests, which needs Java 25 and the 26.3 client jar and libs it
caches. CmdCheck only knows foxcraft_dungeon_loot ids, so an error about a rwysow predicate, loot table or item modifier is
dropped when the file for it exists under data/. This pack has no macro lines.
Usage: python scripts/check_cmds.py
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FUNCS = ROOT / 'data/rwysow/function'
FDL = Path(os.environ.get('FDL_ROOT', 'D:/satyrnidae/minecraft/datapacks/foxcraft-dungeon-loot-2'))
CACHE = FDL / 'tests/.cache'
JAVA = Path(os.environ.get('JAVA25', Path.home() / '.jdks/temurin-25.0.4.1/bin/java.exe'))
REGISTRY_DIR = {'predicate': 'predicate', 'item_modifier': 'item_modifier', 'loot_table': 'loot_table',
                'advancement': 'advancement'}


def classpath():
    libs = sorted((CACHE / 'libs').glob('*.jar'))
    return os.pathsep.join([str(CACHE / 'classes'), str(CACHE / 'mc/26.3/26.3.jar'), *map(str, libs)])


def run(folder):
    out = subprocess.run([str(JAVA), '-cp', classpath(), 'CmdCheck', str(folder)], cwd=tempfile.gettempdir(),
                         capture_output=True, text=True)
    return [l for l in (out.stdout + out.stderr).splitlines() if l and 'WARNING' not in l and 'INFO' not in l]


def real_problem(line):
    m = re.search(r"Can't find element 'rwysow:([^']+)' in registry 'minecraft:(\w+)'", line)
    if not m:
        return True
    folder = REGISTRY_DIR.get(m.group(2))
    return not (folder and (ROOT / 'data/rwysow' / folder / f'{m.group(1)}.json').exists())


lines = run(FUNCS)
summary = [l for l in lines if l.startswith('files:')]
bad = [l for l in lines if re.match(r'\S+:\d+:', l) and real_problem(l)]
print('functions', summary[0] if summary else '(no summary)')
for l in bad:
    print('PROBLEM', l)
print(f'{len(bad)} real problems')

# PackLoad loads the advancement and tags with the game's own registry codecs, catching bad condition formats and unknown ids
load = subprocess.run([str(JAVA), '-cp', classpath(), 'PackLoad', str(ROOT)], cwd=tempfile.gettempdir(),
                      capture_output=True, text=True)
loaded = [l for l in (load.stdout + load.stderr).splitlines() if l.startswith('PackLoad')]
print(loaded[0] if loaded else '(no PackLoad summary)')
sys.exit(1 if bad or not summary or load.returncode else 0)
