"""
SLM Store — persist weights, generate Ollama Modelfile, version management.
"""
import json
import re
from pathlib import Path
from datetime import datetime

from app.config import get_settings

settings = get_settings()

MODELFILE_TEMPLATE = """\
FROM {base_model_path}

# Domain-specific system prompt distilled from knowledge graph
SYSTEM \"\"\"{system_prompt}\"\"\"

# QLoRA adapter applied during build
PARAMETER stop "<|endoftext|>"
PARAMETER temperature 0.2
PARAMETER num_predict 2048
"""

SYSTEM_PROMPT_TEMPLATE = """\
You are a specialized AI assistant for the domain: {domain_label}.
You have been trained on a curated knowledge graph derived from the user's corpus.

Coverage topics: {topics}

When answering:
1. Ground every claim in the knowledge graph context provided.
2. If a question is outside your domain, state:
   "This question is outside my domain. I specialize in: {domain_label}."
3. Decompose complex queries into sub-tasks and indicate which sub-tasks
   require specialist models (code_generation, data_analysis, etc.) using:
   ROUTE: <task_type> | confidence: <0.0-1.0>
"""


class SLMStore:
    def __init__(self, store_path: str | None = None):
        self.base = Path(store_path or settings.slm_store_path)
        self.base.mkdir(parents=True, exist_ok=True)

    def model_dir(self, model_id: str) -> Path:
        return self.base / model_id

    def next_version(self, domain_label: str) -> str:
        """Find the next version number for a domain's SLM."""
        slug = re.sub(r"[^\w]", "_", domain_label.lower())
        existing = sorted(self.base.glob(f"{slug}_v*"))
        if not existing:
            return f"{slug}_v1"
        latest = existing[-1].name
        match = re.search(r"_v(\d+)$", latest)
        v = int(match.group(1)) + 1 if match else 2
        return f"{slug}_v{v}"

    def save_adapter(self, model_id: str, adapter_path: str) -> str:
        """
        Copy/move adapter weights into store. Returns canonical stored path.
        In Hugging Face PEFT, adapter_path is the directory with adapter_model.bin.
        """
        src = Path(adapter_path)
        dest = self.model_dir(model_id)
        dest.mkdir(parents=True, exist_ok=True)

        if not src.exists():
            # Adapter was never produced (e.g. training skipped or failed).
            # Log and return gracefully instead of raising.
            import logging
            logging.getLogger(__name__).warning(
                "save_adapter: path %s does not exist, skipping copy.", src
            )
            return str(dest)

        import shutil
        if src.is_dir():
            shutil.copytree(src, dest / "adapter", dirs_exist_ok=True)
        else:
            shutil.copy2(src, dest / "adapter_model.bin")

        return str(dest)

    def write_modelfile(
        self,
        model_id: str,
        base_model: str,
        domain_label: str,
        coverage_topics: list[str],
    ) -> str:
        """Generate and write an Ollama Modelfile. Returns path."""
        model_path = self.model_dir(model_id)
        model_path.mkdir(parents=True, exist_ok=True)

        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            domain_label=domain_label,
            topics=", ".join(coverage_topics[:10]),
        )

        modelfile_content = MODELFILE_TEMPLATE.format(
            base_model_path=base_model,
            system_prompt=system_prompt,
        )

        modelfile_path = model_path / "Modelfile"
        modelfile_path.write_text(modelfile_content, encoding="utf-8")
        return str(modelfile_path)

    def save_metadata(self, model_id: str, metadata: dict) -> None:
        dest = self.model_dir(model_id)
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "metadata.json").write_text(
            json.dumps({**metadata, "saved_at": datetime.utcnow().isoformat()}, indent=2)
        )

    def load_metadata(self, model_id: str) -> dict | None:
        path = self.model_dir(model_id) / "metadata.json"
        if not path.exists():
            return None
        return json.loads(path.read_text())
