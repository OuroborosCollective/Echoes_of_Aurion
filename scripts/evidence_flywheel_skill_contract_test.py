from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / 'AGENTS.md'
SKILL = ROOT / 'docs/agent-knowledgebase/skill-archive/aurion-evidence-flywheel/SKILL.md'
ARCH = ROOT / 'docs/architecture/AURION_EVIDENCE_FLYWHEEL.v1.md'

def test_aurion_evidence_flywheel_contract_and_docs() -> None:
    for path in (SKILL, ARCH):
        assert path.is_file()
        text = path.read_text(encoding='utf-8')
        assert 'exact revision' in text.lower()
        assert 'baseline' in text.lower()
        assert 'causal' in text.lower()
        assert 'regression' in text.lower()
        assert 'readback' in text.lower()

    agents = AGENTS.read_text(encoding='utf-8')
    for required in ('Evidence Flywheel', 'independent', 'readback', 'Aurion'):
        assert required in agents

    skill_text = SKILL.read_text(encoding='utf-8').lower()
    for forbidden in (
        'lower thresholds',
        'skip flaky',
        'self-grading',
        'second gameplay authority',
        'second truth source',
    ):
        assert forbidden in skill_text