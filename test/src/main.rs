use std::{env, process::Command};

#[derive(Debug, PartialEq)]
struct Case<'a> {
    source: &'a str,
    expect: Expect<'a>,
    line: usize,
}

#[derive(Debug, PartialEq)]
enum Expect<'a> {
    Output(&'a str),
    Error(&'a str),
}

fn main() {
    let backend = env::var("BACKEND").expect("requires a backend");
    for case in parse_cases(include_str!("cases"), &[&backend]).expect("invalid syntax") {
        let result = Command::new("bun")
            .args(["index", "run", "--backend", &backend, "--eval", case.source])
            .current_dir("..")
            .output()
            .unwrap();
        let stdout = str::from_utf8(&result.stdout).unwrap();
        let stderr = str::from_utf8(&result.stderr).unwrap();

        match case.expect {
            Expect::Output(expect) => {
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
                    stdout, expect,
                    "{}: `{}` test failed.",
                    case.line, case.source,
                );
            }
            Expect::Error(expect) => assert_eq!(
                stderr.trim(),
                expect,
                "{}: `{}` test failed.",
                case.line,
                case.source,
            ),
        }
    }
}

#[derive(Debug, PartialEq)]
enum State<'a> {
    Init,
    Source {
        start_line: usize,
        start: usize,
    },
    BeforeExpect {
        start_line: usize,
        source: &'a str,
        is_error: bool,
    },
    Expect {
        start_line: usize,
        source: &'a str,
        is_error: bool,
        start: usize,
    },
    Ignore,
}

fn parse_cases<'a>(raw: &'a str, defined_identifiers: &[&str]) -> Option<Vec<Case<'a>>> {
    let raw = raw.as_bytes();
    let mut cases = vec![];

    let mut i = 0;
    let mut line = 1;
    let mut state = State::Init;

    macro_rules! read_until {
        ('\n') => {
            while i < raw.len() && raw[i] != b'\n' {
                i += 1;
            }
        };

        ($c:expr) => {
            while i < raw.len() && raw[i] != $c as u8 {
                if raw[i] == b'\n' {
                    line += 1;
                }
                i += 1;
            }
        };
    }

    while i < raw.len() {
        match (raw[i], raw.get(i + 1).copied()) {
            (b' ', _) => i += 1,
            (b'\n', _) => {
                i += 1;
                line += 1;
            }
            (b'/', Some(b'/')) if state == State::Init => read_until!('\n'),
            (b'#', _) if state == State::Init || state == State::Ignore => {
                i += 1;
                let directive_start = i;
                while i < raw.len() && raw[i] != b' ' && raw[i] != b'\n' {
                    i += 1;
                }

                match &raw[directive_start..i] {
                    b"if" => {
                        if raw[i] == b'\n' {
                            line += 1;
                        }
                        i += 1;
                        let id_start = i;
                        read_until!('\n');

                        let id = str::from_utf8(&raw[id_start..i]).ok()?;
                        if defined_identifiers.contains(&id) {
                            i += 1;
                            line += 1;
                            continue;
                        }

                        state = State::Ignore;
                    }
                    b"endif" => {
                        if raw[i] == b'\n' {
                            line += 1;
                        }
                        i += 1;
                        state = State::Init;
                    }
                    _ => return None,
                }
            }
            _ if state == State::Ignore => read_until!('\n'),
            (b'=', Some(b'>')) => {
                if let State::Source { start_line, start } = state {
                    state = State::BeforeExpect {
                        start_line,
                        source: unsafe { str::from_utf8_unchecked(&raw[start..i]) }.trim_end(),
                        is_error: false,
                    };
                    i += 2;
                } else {
                    panic!("invalid state: {state:?}");
                }
            }
            (b'!', Some(b'>')) => {
                if let State::Source { start_line, start } = state {
                    state = State::BeforeExpect {
                        start_line,
                        source: unsafe { str::from_utf8_unchecked(&raw[start..i]) }.trim_end(),
                        is_error: true,
                    };
                    i += 2;
                } else {
                    panic!("invalid state: {state:?}");
                }
            }
            (c, Some(b'>')) => {
                if c == b'\n' {
                    line += 1;
                }
                i += 1;
            }
            (b';', _) => {
                if let State::Expect {
                    start_line,
                    source,
                    is_error,
                    start,
                } = state
                {
                    let expect = unsafe { str::from_utf8_unchecked(&raw[start..i]) };
                    cases.push(Case {
                        source,
                        expect: if is_error {
                            Expect::Error(expect)
                        } else {
                            Expect::Output(expect)
                        },
                        line: start_line,
                    });

                    state = State::Init;
                    i += 1;
                } else {
                    panic!("invalid state: {state:?}");
                }
            }
            _ => match state {
                State::Init => {
                    state = State::Source {
                        start_line: line,
                        start: i,
                    }
                }
                State::Source { .. } => {
                    while i + 1 < raw.len() && raw[i + 1] != b'>' {
                        if raw[i] == b'\n' {
                            line += 1;
                        }
                        i += 1;
                    }
                }
                State::BeforeExpect {
                    start_line,
                    source,
                    is_error,
                } => {
                    state = State::Expect {
                        start_line,
                        source,
                        is_error,
                        start: i,
                    }
                }
                State::Expect { .. } => read_until!(';'),
                _ => panic!("invalid state: {state:?}"),
            },
        }
    }

    (state == State::Init).then_some(cases)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cases_normal() {
        assert_eq!(
            parse_cases(
                r"
(foo)
(bar) => baz;
cat !> neko;
                ",
                &[],
            ),
            Some(vec![
                Case {
                    source: "(foo)\n(bar)",
                    expect: Expect::Output("baz"),
                    line: 2,
                },
                Case {
                    source: "cat",
                    expect: Expect::Error("neko"),
                    line: 4,
                },
            ]),
        );

        assert_eq!(
            parse_cases(
                r"
(foo)
(bar) => baz
cat !> neko;
                ",
                &[],
            ),
            Some(vec![Case {
                source: "(foo)\n(bar)",
                expect: Expect::Output("baz\ncat !> neko"),
                line: 2,
            }]),
        );

        assert_eq!(
            parse_cases(
                r"
(foo)
(bar) baz;
cat !> neko;
                ",
                &[],
            ),
            Some(vec![Case {
                source: "(foo)\n(bar) baz;\ncat",
                expect: Expect::Error("neko"),
                line: 2,
            }]),
        );
    }

    #[test]
    fn test_parse_cases_abnormal() {
        assert_eq!(
            parse_cases(
                r"
(foo)
(bar) => baz;
cat !> neko
                ",
                &[],
            ),
            None,
        );

        assert_eq!(
            parse_cases(
                r"
(foo)
(bar) => baz;
cat neko;
                ",
                &[],
            ),
            None,
        );
    }

    #[test]
    fn test_parse_cases_comment() {
        assert_eq!(
            parse_cases(
                r"
// 1
(foo) // 5
(bar) => baz; // 2
  // 3
cat !> //6 neko;
// 4
                ",
                &[],
            ),
            Some(vec![
                Case {
                    source: "(foo) // 5\n(bar)",
                    expect: Expect::Output("baz"),
                    line: 3,
                },
                Case {
                    source: "cat",
                    expect: Expect::Error("//6 neko"),
                    line: 6,
                },
            ]),
        );
    }

    #[test]
    fn test_parse_cases_right_angle_bracket() {
        assert_eq!(
            parse_cases(
                "123
>= 456 => false;
foo !> bar;",
                &[],
            ),
            Some(vec![
                Case {
                    source: "123\n>= 456",
                    expect: Expect::Output("false"),
                    line: 1,
                },
                Case {
                    source: "foo",
                    expect: Expect::Error("bar"),
                    line: 3,
                },
            ]),
        )
    }

    #[test]
    fn test_parse_cases_if() {
        assert_eq!(
            parse_cases(
                "
(foo)
(bar) => baz;
#if HELLO
cat !> neko;
#endif
thank => you;
#if ignore
nothing => here;
#endif
                ",
                &["HELLO"],
            ),
            Some(vec![
                Case {
                    source: "(foo)\n(bar)",
                    expect: Expect::Output("baz"),
                    line: 2,
                },
                Case {
                    source: "cat",
                    expect: Expect::Error("neko"),
                    line: 5,
                },
                Case {
                    source: "thank",
                    expect: Expect::Output("you"),
                    line: 7,
                },
            ]),
        );
    }
}
