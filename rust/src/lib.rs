//! Core Rust analysis helpers for pi-inline-format.

use serde::{Deserialize, Serialize};

const OUTER_LANGUAGE: &str = "bash";
const PYTHON_HEREDOC_MARKERS: [&str; 3] = ["<<'PY'", "<<\"PY\"", "<<PY"];
const NESTED_REGION_PATTERNS: [NestedRegionPattern; 1] = [NestedRegionPattern {
    id_prefix: "embedded",
    outer_language: OUTER_LANGUAGE,
    embedded_language: "python",
    kind: PatternKind::Heredoc(HeredocPattern {
        start_markers: &PYTHON_HEREDOC_MARKERS,
        terminator: "PY",
    }),
}];

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
struct NestedRegionPattern {
    id_prefix: &'static str,
    outer_language: &'static str,
    embedded_language: &'static str,
    kind: PatternKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PatternKind {
    Heredoc(HeredocPattern),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct HeredocPattern {
    start_markers: &'static [&'static str],
    terminator: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DetectedEmbeddedRegion {
    pattern: NestedRegionPattern,
    start_byte: usize,
    end_byte: usize,
}

/// Inspect a transcript and return the stable analysis contract.
#[must_use]
pub fn analyze_transcript(request: &AnalyzeRequest) -> AnalyzeResponse {
    let transcript_length = request.transcript.len();
    let detected_region = detect_nested_region(&request.transcript);
    let regions = detected_region.map_or_else(
        || vec![outer_region(0, OUTER_LANGUAGE, 0, transcript_length)],
        |region| build_split_regions(transcript_length, region),
    );
    let render_blocks = build_render_blocks(&request.transcript, &regions);

    AnalyzeResponse { regions, render_blocks }
}

fn detect_nested_region(transcript: &str) -> Option<DetectedEmbeddedRegion> {
    NESTED_REGION_PATTERNS
        .iter()
        .find_map(|pattern| detect_pattern(transcript, *pattern))
}

fn detect_pattern(
    transcript: &str,
    pattern: NestedRegionPattern,
) -> Option<DetectedEmbeddedRegion> {
    match pattern.kind {
        PatternKind::Heredoc(heredoc_pattern) => {
            detect_heredoc_region(transcript, pattern, heredoc_pattern)
        }
    }
}

fn detect_heredoc_region(
    transcript: &str,
    pattern: NestedRegionPattern,
    heredoc_pattern: HeredocPattern,
) -> Option<DetectedEmbeddedRegion> {
    heredoc_pattern.start_markers.iter().find_map(|marker| {
        let marker_start = transcript.find(marker)?;
        let marker_end = marker_start + marker.len();
        let embedded_start = transcript[marker_end..].find('\n')? + marker_end + 1;
        let embedded_end = find_line_match_start(
            &transcript[embedded_start..],
            heredoc_pattern.terminator,
        )? + embedded_start;

        if embedded_start >= embedded_end {
            return None;
        }

        Some(DetectedEmbeddedRegion {
            pattern,
            start_byte: embedded_start,
            end_byte: embedded_end,
        })
    })
}

fn build_split_regions(
    transcript_length: usize,
    detected_region: DetectedEmbeddedRegion,
) -> Vec<TranscriptRegion> {
    let mut regions = Vec::with_capacity(3);

    if detected_region.start_byte > 0 {
        regions.push(outer_region(
            0,
            detected_region.pattern.outer_language,
            0,
            detected_region.start_byte,
        ));
    }

    regions.push(embedded_region(
        detected_region.pattern.id_prefix,
        0,
        detected_region.pattern.embedded_language,
        detected_region.start_byte,
        detected_region.end_byte,
    ));

    if detected_region.end_byte < transcript_length {
        let trailing_outer_index = usize::from(!regions.is_empty());
        regions.push(outer_region(
            trailing_outer_index,
            detected_region.pattern.outer_language,
            detected_region.end_byte,
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

fn outer_region(
    index: usize,
    language: &str,
    start_byte: usize,
    end_byte: usize,
) -> TranscriptRegion {
    TranscriptRegion {
        id: format!("outer-{index}"),
        role: RegionRole::Outer,
        language: language.to_string(),
        start_byte,
        end_byte,
    }
}

fn embedded_region(
    id_prefix: &str,
    index: usize,
    language: &str,
    start_byte: usize,
    end_byte: usize,
) -> TranscriptRegion {
    TranscriptRegion {
        id: format!("{id_prefix}-{index}"),
        role: RegionRole::Embedded,
        language: language.to_string(),
        start_byte,
        end_byte,
    }
}

fn find_line_match_start(transcript: &str, expected_line: &str) -> Option<usize> {
    let mut line_start = 0usize;

    for line in transcript.split_inclusive('\n') {
        let trimmed = line.trim_end_matches('\n');
        if trimmed == expected_line {
            return Some(line_start);
        }
        line_start += line.len();
    }

    if transcript[line_start..] == *expected_line {
        return Some(line_start);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::{
        AnalyzeRequest, NESTED_REGION_PATTERNS, OUTER_LANGUAGE, PatternKind,
        RegionRole, RenderBlock, TranscriptRegion, analyze_transcript,
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
                language: String::from(OUTER_LANGUAGE),
                start_byte: 0,
                end_byte: transcript.len(),
            }],
        );
        assert_eq!(
            response.render_blocks,
            vec![RenderBlock {
                id: String::from("outer-0"),
                role: RegionRole::Outer,
                language: String::from(OUTER_LANGUAGE),
                content: transcript,
            }],
        );
    }

    #[test]
    fn separates_python_file_heredocs_in_plain_bash_commands() {
        let transcript = String::from(
            "cat > /tmp/delete.me.py <<'PY'\nprint('hi')\nprint('bye')\nPY\npython /tmp/delete.me.py\n",
        );
        let request = AnalyzeRequest { transcript };

        let response = analyze_transcript(&request);

        assert_eq!(response.render_blocks.len(), 3);
        assert_eq!(response.render_blocks[0].role, RegionRole::Outer);
        assert_eq!(response.render_blocks[1].role, RegionRole::Embedded);
        assert_eq!(response.render_blocks[1].language, "python");
        assert_eq!(response.render_blocks[2].role, RegionRole::Outer);
        assert_eq!(
            response.render_blocks[0].content,
            "cat > /tmp/delete.me.py <<'PY'\n"
        );
        assert_eq!(response.render_blocks[1].content, "print('hi')\nprint('bye')\n");
        assert_eq!(response.render_blocks[2].content, "PY\npython /tmp/delete.me.py\n");
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
                    language: String::from(OUTER_LANGUAGE),
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
                    language: String::from(OUTER_LANGUAGE),
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
                language: String::from(OUTER_LANGUAGE),
                start_byte: 0,
                end_byte: transcript.len(),
            }],
        );
    }

    #[test]
    fn nested_region_patterns_encode_future_growth_without_changing_the_contract() {
        assert_eq!(NESTED_REGION_PATTERNS.len(), 1);

        let python_pattern = NESTED_REGION_PATTERNS[0];
        assert_eq!(python_pattern.id_prefix, "embedded");
        assert_eq!(python_pattern.outer_language, OUTER_LANGUAGE);
        assert_eq!(python_pattern.embedded_language, "python");
        match python_pattern.kind {
            PatternKind::Heredoc(heredoc_pattern) => {
                assert_eq!(heredoc_pattern.terminator, "PY");
                assert_eq!(heredoc_pattern.start_markers.len(), 3);
            }
        }
    }

    #[test]
    fn outer_and_embedded_regions_use_distinct_roles_in_the_contract() {
        let outer_region = TranscriptRegion {
            id: String::from("outer-0"),
            role: RegionRole::Outer,
            language: String::from(OUTER_LANGUAGE),
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
