//! Core Rust analysis helpers for pi-inline-format.

use serde::{Deserialize, Serialize};

const PYTHON_HEREDOC_MARKERS: [&str; 3] =
    ["python - <<'PY'", "python - <<\"PY\"", "python - <<PY"];
const PYTHON_HEREDOC_TERMINATOR: &str = "PY";

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

/// Describe one render-ready block derived from analyzed transcript regions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RenderBlock {
    /// Stable identifier for this block within a single response.
    pub id: String,
    /// Whether this block represents wrapper transcript content or embedded code.
    pub role: RegionRole,
    /// Language that a renderer should use for this block.
    pub language: String,
    /// Extracted block content for direct rendering.
    pub content: String,
}

/// Summarize the transcript analysis output returned by the Rust core.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalyzeResponse {
    /// Ordered language-aware regions describing the transcript structure.
    pub regions: Vec<TranscriptRegion>,
    /// Ordered render-ready blocks that preserve wrapper/code separation.
    pub render_blocks: Vec<RenderBlock>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct HeredocRegionMatch {
    embedded_start: usize,
    embedded_end: usize,
}

/// Inspect a transcript and return the stable analysis contract.
#[must_use]
pub fn analyze_transcript(request: &AnalyzeRequest) -> AnalyzeResponse {
    let transcript_length = request.transcript.len();

    let regions = find_python_heredoc_region(&request.transcript).map_or_else(
        || vec![outer_region(0, 0, transcript_length)],
        |heredoc_match| build_split_regions(transcript_length, heredoc_match),
    );
    let render_blocks = build_render_blocks(&request.transcript, &regions);

    AnalyzeResponse { regions, render_blocks }
}

fn build_split_regions(
    transcript_length: usize,
    heredoc_match: HeredocRegionMatch,
) -> Vec<TranscriptRegion> {
    let mut regions = Vec::with_capacity(3);

    if heredoc_match.embedded_start > 0 {
        regions.push(outer_region(0, 0, heredoc_match.embedded_start));
    }

    regions.push(TranscriptRegion {
        id: String::from("embedded-0"),
        role: RegionRole::Embedded,
        language: String::from("python"),
        start_byte: heredoc_match.embedded_start,
        end_byte: heredoc_match.embedded_end,
    });

    if heredoc_match.embedded_end < transcript_length {
        let trailing_outer_index = usize::from(!regions.is_empty());
        regions.push(outer_region(
            trailing_outer_index,
            heredoc_match.embedded_end,
            transcript_length,
        ));
    }

    regions
}

fn build_render_blocks(
    transcript: &str,
    regions: &[TranscriptRegion],
) -> Vec<RenderBlock> {
    regions
        .iter()
        .map(|region| RenderBlock {
            id: region.id.clone(),
            role: region.role,
            language: region.language.clone(),
            content: transcript[region.start_byte..region.end_byte].to_string(),
        })
        .collect()
}

fn outer_region(index: usize, start_byte: usize, end_byte: usize) -> TranscriptRegion {
    TranscriptRegion {
        id: format!("outer-{index}"),
        role: RegionRole::Outer,
        language: String::from("bash"),
        start_byte,
        end_byte,
    }
}

fn find_python_heredoc_region(transcript: &str) -> Option<HeredocRegionMatch> {
    PYTHON_HEREDOC_MARKERS.iter().find_map(|marker| {
        let marker_start = transcript.find(marker)?;
        let marker_end = marker_start + marker.len();
        let embedded_start = transcript[marker_end..].find('\n')? + marker_end + 1;
        let embedded_end =
            find_heredoc_terminator_start(&transcript[embedded_start..])?
                + embedded_start;

        if embedded_start >= embedded_end {
            return None;
        }

        Some(HeredocRegionMatch { embedded_start, embedded_end })
    })
}

fn find_heredoc_terminator_start(transcript: &str) -> Option<usize> {
    let mut line_start = 0usize;

    for line in transcript.split_inclusive('\n') {
        let trimmed = line.trim_end_matches('\n');
        if trimmed == PYTHON_HEREDOC_TERMINATOR {
            return Some(line_start);
        }
        line_start += line.len();
    }

    if transcript[line_start..] == *PYTHON_HEREDOC_TERMINATOR {
        return Some(line_start);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::{
        AnalyzeRequest, RegionRole, RenderBlock, TranscriptRegion, analyze_transcript,
    };

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
        assert_eq!(
            response.render_blocks,
            vec![RenderBlock {
                id: String::from("outer-0"),
                role: RegionRole::Outer,
                language: String::from("bash"),
                content: transcript,
            }],
        );
    }

    #[test]
    fn separates_shell_wrapper_regions_from_embedded_python_code() {
        let transcript = String::from(
            "$ python - <<'PY'\nprint('hi')\nprint('bye')\nPY\n$ echo done\n",
        );
        let request = AnalyzeRequest { transcript: transcript.clone() };

        let response = analyze_transcript(&request);

        assert_eq!(response.regions.len(), 3);
        assert_eq!(response.regions[0].role, RegionRole::Outer);
        assert_eq!(response.regions[1].language, "python");
        assert_eq!(response.regions[1].role, RegionRole::Embedded);
        assert_eq!(response.regions[2].role, RegionRole::Outer);
        assert_eq!(
            &transcript[response.regions[0].start_byte..response.regions[0].end_byte],
            "$ python - <<'PY'\n",
        );
        assert_eq!(
            &transcript[response.regions[1].start_byte..response.regions[1].end_byte],
            "print('hi')\nprint('bye')\n",
        );
        assert_eq!(
            &transcript[response.regions[2].start_byte..response.regions[2].end_byte],
            "PY\n$ echo done\n",
        );
    }

    #[test]
    fn produces_distinct_render_blocks_for_wrapper_and_embedded_code() {
        let request = AnalyzeRequest {
            transcript: String::from(
                "$ python - <<'PY'\nprint('hi')\nPY\n$ echo done\n",
            ),
        };

        let response = analyze_transcript(&request);

        assert_eq!(response.render_blocks.len(), 3);
        assert_eq!(
            response.render_blocks,
            vec![
                RenderBlock {
                    id: String::from("outer-0"),
                    role: RegionRole::Outer,
                    language: String::from("bash"),
                    content: String::from("$ python - <<'PY'\n"),
                },
                RenderBlock {
                    id: String::from("embedded-0"),
                    role: RegionRole::Embedded,
                    language: String::from("python"),
                    content: String::from("print('hi')\n"),
                },
                RenderBlock {
                    id: String::from("outer-1"),
                    role: RegionRole::Outer,
                    language: String::from("bash"),
                    content: String::from("PY\n$ echo done\n"),
                },
            ],
        );
    }

    #[test]
    fn ignores_incomplete_python_heredocs_when_no_terminator_exists() {
        let transcript = String::from("$ python - <<'PY'\nprint('hi')\n$ echo done\n");
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
