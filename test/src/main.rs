use std::{env, process::Command};

#[derive(Debug)]
struct Case {
    source: &'static str,
    expect: &'static str,
}

macro_rules! c {
    ($source:tt => $expect:tt) => {
        Case {
            source: stringify!($source),
            expect: stringify!($expect),
        }
    };
}

macro_rules! cases {
    ($($source:tt => $expect:tt)*) => { [$(c![$source => $expect]),*] };
}

fn main() {
    let backend = env::var("BACKEND").expect("requires a backend");
    for case in include!("cases") {
        let result = Command::new("bun")
            .args(["index", "run", "--backend", &backend, "--eval", case.source])
            .current_dir("..")
            .output()
            .unwrap();
        let stdout = str::from_utf8(&result.stdout).unwrap();
        let stderr = str::from_utf8(&result.stderr).unwrap();

        if !stderr.is_empty() {
            eprintln!("Error occurs when testing `{}`: {stderr}", case.source);
            break;
        }
        assert_eq!(stdout, case.expect);
    }
}
