"""
LLMLingua prompt compressor — applied ONLY to graph context, never system prompts or code.
9-11x compression for long knowledge graph excerpts.
"""
from app.config import get_settings

settings = get_settings()


class ContextCompressor:
    def __init__(self):
        self._compressor = None

    def _get_compressor(self):
        if self._compressor is None:
            try:
                from llmlingua import PromptCompressor
                self._compressor = PromptCompressor(
                    model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
                    use_llmlingua2=True,
                    device_map="cpu",
                )
            except Exception:
                self._compressor = "unavailable"
        return self._compressor if self._compressor != "unavailable" else None

    def compress(
        self,
        graph_context: str,
        instruction: str,
        target_ratio: float = 0.1,  # 10% of original → ~10x compression
    ) -> str:
        """
        Compress graph_context. Returns original if compressor unavailable.
        NEVER pass system prompts, code, or structured data through here.
        """
        compressor = self._get_compressor()
        if not compressor or not graph_context:
            return graph_context

        try:
            result = compressor.compress_prompt(
                context=[graph_context],
                instruction=instruction,
                question="",
                target_token=max(200, int(len(graph_context.split()) * target_ratio)),
                condition_compare=True,
                rank_method="longllmlingua",
            )
            return result.get("compressed_prompt", graph_context)
        except Exception:
            return graph_context


_compressor: ContextCompressor | None = None


def get_compressor() -> ContextCompressor:
    global _compressor
    if _compressor is None:
        _compressor = ContextCompressor()
    return _compressor
