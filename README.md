# Formatter

This tool rewrites the files of a git repository so that their layout follows one fixed style: the same spaces, line breaks, quotes and indentation however each file was typed. It can also check a repository without changing it and say which files are not yet in that style.

## What it does to a file

The meaning of a file stays the same; only its layout changes. Three examples follow, each a file as someone typed it and the same file after `formatter write`.

A JSON file, `settings.json`, before:

```text
{
"name":"demo",
    "tags":["a","b"],
  "size":   3
}
```

After:

```json
{
  "name": "demo",
  "tags": ["a", "b"],
  "size": 3
}
```

A Python file, `greet.py`, before:

```python
import os,sys
def greet(name,greeting='hello'):
  return greeting+', '+name
```

After:

```python
import os, sys


def greet(name, greeting="hello"):
    return greeting + ", " + name
```

A shell script, `hello.sh`, before:

```sh
#!/bin/sh
if [ -n "$1" ];then
echo  "hello $1"
else
    echo hello
fi
```

After:

```sh
#!/bin/sh
if [ -n "$1" ]; then
  echo "hello $1"
else
  echo hello
fi
```

The style is not chosen here. Each kind of file is handed to a well-known tool that formats it, and that tool runs with its own default settings:

| Files                                                                  | Tool                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Markdown, JSON, YAML, JavaScript, TypeScript, CSS, HTML and the others | [Prettier](https://prettier.io) 3.10.1                |
| Python (`.py`)                                                         | [Ruff](https://docs.astral.sh/ruff/) 0.17.6           |
| Shell scripts (`.sh`, `.bash`)                                         | [sh-syntax](https://github.com/un-ts/sh-syntax) 0.8.7 |

Settings files in your repository, such as a `.prettierrc`, an `.editorconfig` or a `ruff.toml`, change nothing. One style for every repository is the point.

## What it says about a repository

Take a small repository with six files:

- `README.md`, already in the style;
- `tool.py`, a Python file that is not;
- `catalog.typify`, a kind of file that none of the three tools knows;
- `bun.lock`, which a package manager writes;
- `fixtures/case.json`, test data that must keep its exact bytes;
- `.formatterignore`, holding the one line `fixtures/`.

`formatter check` reads them, changes nothing, and prints:

```text
$ formatter check
formatted      2
unformatted    2
  .formatterignore  1
  .typify           1
tool-written   1
ignored        1
would change   1
  tool.py
$ echo $?
1
```

Each file lands in one group, called its class:

- **formatted**: one of the three tools formats it. Here `README.md` and `tool.py`.
- **unformatted**: no tool formats it yet. The report counts these by file extension, so nothing is passed over in silence.
- **tool-written**: a program writes it and rewrites it, so it is left alone. Here `bun.lock`.
- **ignored**: named in `.formatterignore`. Here `fixtures/case.json`.

Two more classes appear when such files exist: **binary** (not text) and **link** (a symbolic link or a submodule, which is never followed).

The last lines list the files whose layout would change. The exit status is 1 because there is at least one. After `formatter write`, the same check says `would change   0` and exits 0.

## Use it in a repository

A repository that uses the formatter adds three things and keeps no other formatting setup.

1. These lines in its `package.json`. A repository without a `package.json` gets exactly this file. Run `bun install` afterwards so that Bun writes the lockfile.

   ```json
   {
     "private": true,
     "scripts": {
       "format": "formatter write",
       "format:check": "formatter check"
     },
     "devDependencies": {
       "@cmzn-consulting/formatter": "github:CMZN-Consulting/formatter#v0.1.0"
     }
   }
   ```

   The package is not published to a registry. A repository names this git repository and a tag, so every machine runs the same tools at the same versions.

2. A `.formatterignore` at the top of the repository, naming the files that must keep their bytes, such as fixtures whose digests are recorded and generated files. It is written like a `.gitignore`, and git itself reads it, so a line means exactly what it would mean there:

   ```text
   fixtures/
   generated/*.json
   !generated/hand-written.json
   ```

3. One step in its CI that runs the check:

   ```yaml
   - run: bun run format:check
   ```

The commit that adopts the formatter also removes the repository's own formatter settings, plugins, scripts and CI steps, and carries the reformatted files.

## Reference

```text
formatter check [--json] [PATH ...]
formatter write [--json] [PATH ...]
```

It needs [Bun](https://bun.sh), git and a POSIX `sh`. The command is a small shell file, `bin/formatter`, that finds its own place through any links and then replaces itself, by `exec`, with one Bun process that is started with `--no-env-file` and an empty configuration file. No code of the formatter runs in a process that read the repository's `bunfig.toml`, so the repository's own Bun settings change nothing. The same files give the same report and the same bytes on Linux, where this was measured; other platforms are not measured yet.

**Which files.** The command works on the git repository that holds the current directory, from its top. It takes the files that git tracks there, that is the files added with `git add`. With one or more `PATH`s it takes only the tracked files at or below those paths, given from the current directory. A file that git does not track is never read and never written. Outside a git repository the command exits 2.

**`check`** writes nothing. It exits:

- 0 when no file of the class `formatted` would change;
- 1 when at least one would;
- 2 when a tool failed on a file (usually a syntax error), or the files could not be listed or read.

The exit status is what the work decided. A report that cannot be printed does not change it: a closed pipe, as in `formatter check | head`, leaves it as it was, and a full device gets a note on standard error and leaves it as it was.

**`write`** formats every file in memory first. If a tool failed on any file, it writes nothing and exits 2. Otherwise it rewrites exactly the files that `check` would list and exits 0. After it exits 0, `check` exits 0.

**The classes**, decided in this order, the first that applies:

1. `link`: git records a symbolic link or a submodule. It is never followed.
2. `ignored`: matched by `.formatterignore` at the top of the repository. The file counts only when git tracks it; one that stands there untracked stops the command.
3. `tool-written`: the file's name is one of `bun.lock`, `bun.lockb`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `uv.lock`, `Cargo.lock`, `flake.lock` or `lake-manifest.json`.
4. `binary`: a zero byte within the first 8,000 bytes, or bytes that are not valid UTF-8.
5. `formatted`: the first tool that takes the name formats it. Prettier takes every name for which it knows a parser; for a name without a dot it also reads the first line, so a script that starts with `#!/usr/bin/env node` is formatted as JavaScript. Ruff takes `.py`; a `.pyi` stub is left unformatted, because the version of Ruff used here cannot lay out a stub. sh-syntax takes `.sh` and `.bash`; a script that holds a carriage return byte fails, because sh-syntax would read that byte as a blank where bash reads it as part of a word.
6. `unformatted`: every other file.

**The report.** One line for each class that has files, with its count. Under `unformatted`, one line per extension (`(none)` for a name without a dot). Then `would change` (or `changed` after a successful `write`) with its count and the paths. Then, if a tool failed, `failed` with each path, the tool and the first line of its message. Paths are written from the top of the repository and sorted by their bytes. A path or an extension that holds a line break or another control character is printed in double quotes, as JSON would write it.

With `--json` the report is one JSON object:

| Key           | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| `root`        | the top of the repository, as an absolute path             |
| `version`     | this formatter's version                                   |
| `backends`    | each tool's name and its exact version                     |
| `classes`     | each of the six classes and its count, zero included       |
| `unformatted` | each extension and its count                               |
| `changed`     | the paths that would change, or changed                    |
| `failed`      | for each failure: `path`, `backend` and the full `message` |

When the files cannot be listed or read safely, the command prints the reason on standard error, prints no report, writes nothing, and exits 2. That happens when:

- a tracked file is missing from disk, or is no longer a regular file there;
- a directory on a tracked file's path has become a link on disk, which would lead outside the repository;
- `.formatterignore` is tracked as a link, or is not a regular file on disk;
- a `.formatterignore` stands at the top of the repository on disk but git does not track it, because it was not yet added. It is not read, and the command says to add it or to remove it;
- a file's name is not valid UTF-8 and the file is not named in `.formatterignore`;
- a file that a tool formats (class `formatted`) has more than one hard link on disk, so a write would change every name of it, inside the repository or outside it. This holds for `check` as well as for `write`;
- a file of the set has an unmerged entry in the index, as during a merge that conflicts, and its text may hold conflict markers. Finish the merge and add the files first;
- `write` would change a file that it is not allowed to write;
- `write` finds, just before it writes, that a file it would change no longer holds the bytes that were formatted, because someone edited it since. Nothing is written, and the message names that file.

## Licence

MIT. See [LICENSE](LICENSE).
