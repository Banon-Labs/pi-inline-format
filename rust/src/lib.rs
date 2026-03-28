//! Core Rust analysis helpers for pi-inline-format.

use serde::{Deserialize, Serialize};

/// Analyze a transcript for nested language hints.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalyzeRequest {
    /// Raw transcript text captured from Pi output.
    pub transcript: String,
}

/// Classify a detected region by its structural role in the transcript.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RegionRole {
    /// The top-level transcript wrapper, such as a shell session.
    Outer,
    /// Embedded code or content nested inside the outer transcript.
    Embedded,
}

/// Describe one language-aware region within the transcript.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TranscriptRegion {
    /// Stable identifier for this region within a single response.
    pub id: String,
    /// Whether this region is the outer transcript or embedded content.
    pub role: RegionRole,
    /// Language associated with the region.
    pub language: String,
    /// Byte offset where the region starts in the original transcript.
    pub start_byte: usize,
    /// Byte offset where the region ends in the original transcript.
    pub end_byte: usize,
}

/// Summarize the transcript analysis output returned by the Rust core.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalyzeResponse {
    /// Ordered language-aware regions describing the transcript structure.
    pub regions: Vec<TranscriptRegion>,
}

/// Inspect a transcript and return the stable analysis contract.
#[must_use]
pub fn analyze_transcript(request: &AnalyzeRequest) -> AnalyzeResponse {
    let transcript_length = request.transcript.len();
    let outer_region = TranscriptRegion {
        id: String::from("outer-0"),
        role: RegionRole::Outer,
        language: String::from("bash"),
        start_byte: 0,
        end_byte: transcript_length,
    };

    AnalyzeResponse { regions: vec![outer_region] }
}

#[cfg(test)]
mod tests {
    use super::{AnalyzeRequest, RegionRole, TranscriptRegion, analyze_transcript};

    #[test]
    fn returns_a_stable_outer_region_contract() {
        let transcript = String::from("$ echo hi\n");
        let request = AnalyzeRequest { transcript: transcript.clone() };

        let response = analyze_transcript(&request);

        assert_eq!(
            response.regions,
            vec![TranscriptRegion {
                id: String::from("outer-0"),
                role: RegionRole::Outer,
                language: String::from("bash"),
                start_byte: 0,
                end_byte: transcript.len(),
            }],
        );
    }

    #[test]
    fn outer_and_embedded_regions_use_distinct_roles_in_the_contract() {
        let outer_region = TranscriptRegion {
            id: String::from("outer-0"),
            role: RegionRole::Outer,
            language: String::from("bash"),
            start_byte: 0,
            end_byte: 12,
        };
        let embedded_region = TranscriptRegion {
            id: String::from("embedded-0"),
            role: RegionRole::Embedded,
            language: String::from("python"),
            start_byte: 13,
            end_byte: 27,
        };

        assert_ne!(outer_region.role, embedded_region.role);
        assert_ne!(outer_region.language, embedded_region.language);
    }
}
