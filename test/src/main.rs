use std::{env, process::Command};

#[derive(Debug)]
struct Case<'a> {
    source: &'a str,
    expect: &'a str,
    line: usize,
}

#[derive(Clone, Copy)]
enum State {
    Source(usize),
    Arrow,
    Expect(usize),
}

fn main() {
    let backend = env::var("BACKEND").expect("requires a backend");
    for case in parse_case(include_str!("cases")) {
        let result = Command::new("bun")
            .args(["index", "run", "--backend", &backend, "--eval", case.source])
            .current_dir("..")
            .output()
            .unwrap();
        let stdout = str::from_utf8(&result.stdout).unwrap();
        let stderr = str::from_utf8(&result.stderr).unwrap();

        if !stderr.is_empty() {
            eprintln!(
                "{}: Error occurs when testing `{}`: {}.",
                case.line,
                case.source,
                stderr.trim(),
            );
            break;
        }
        assert_eq!(
            stdout, case.expect,
            "{}: `{}` test failed.",
            case.line, case.source,
        );
    }
}

fn parse_case(raw: &str) -> Vec<Case<'_>> {
    let raw = raw.as_bytes();
    let mut cases = vec![];

    let mut i = 0;
    let mut state = State::Source(i);
    let mut prev_state = state;
    let mut source = "";
    let mut line = 1;
    while i < raw.len() {
        let c = raw[i] as char;
        match state {
            State::Source(_) => {
                if c == '=' {
                    prev_state = state;
                    state = State::Arrow
                }
            }
            State::Arrow => {
                if c == '>' {
                    let State::Source(start) = prev_state else {
                        unreachable!();
                    };
                    source = unsafe { str::from_utf8_unchecked(&raw[start..i - 1]) }.trim();
                    state = State::Expect(i + 1);
                } else {
                    state = prev_state;
                }
            }
            State::Expect(start) => {
                if c == '\n' {
                    cases.push(Case {
                        source,
                        expect: unsafe { str::from_utf8_unchecked(&raw[start..i]) }.trim(),
                        line,
                    });
                    line += 1;
                    state = State::Source(i + 1);
                }
            }
        }
        i += 1;
    }

    cases
}
