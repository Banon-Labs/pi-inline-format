//! CLI entrypoint for the pi-inline-format Rust core.

use std::io::{self, Read};

use pi_inline_format_core::{AnalyzeRequest, analyze_transcript};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;

    let request = AnalyzeRequest { transcript: input };
    let response = analyze_transcript(&request);
    let json = serde_json::to_string_pretty(&response)?;

    println!("{json}");
    Ok(())
}
