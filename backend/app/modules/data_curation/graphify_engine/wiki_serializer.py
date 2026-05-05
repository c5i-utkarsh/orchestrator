import struct
from pathlib import Path

import tiktoken


class WikiSerializer:
    """
    Converts graphifyy nanoWiki community articles into Karpathy-format
    flat uint16 token arrays: train.bin and val.bin.
    
    Format: flat uint16 stream, EOT token (100257) separates articles.
    Follows nanoGPT prepare.py convention.
    """

    EOT_TOKEN = 100257  # GPT-4 tiktoken EOT
    TRAIN_SPLIT = 0.95

    def __init__(self, output_dir: str):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._enc = tiktoken.get_encoding("cl100k_base")

    def serialize(self, articles: list[dict]) -> dict:
        """
        articles: list of {title, content}
        Returns: {train_tokens, val_tokens, total_articles, vocab_size}
        """
        all_tokens: list[int] = []

        for article in articles:
            text = f"# {article['title']}\n\n{article['content']}\n"
            tokens = self._enc.encode_ordinary(text)
            all_tokens.extend(tokens)
            all_tokens.append(self.EOT_TOKEN)

        if not all_tokens:
            return {"train_tokens": 0, "val_tokens": 0, "total_articles": 0}

        split_idx = int(len(all_tokens) * self.TRAIN_SPLIT)
        train_tokens = all_tokens[:split_idx]
        val_tokens = all_tokens[split_idx:]

        self._write_bin(self.output_dir / "train.bin", train_tokens)
        self._write_bin(self.output_dir / "val.bin", val_tokens)

        return {
            "train_tokens": len(train_tokens),
            "val_tokens": len(val_tokens),
            "total_articles": len(articles),
            "vocab_size": self._enc.n_vocab,
        }

    def _write_bin(self, path: Path, tokens: list[int]):
        """Write token list as raw uint16 binary — identical to nanoGPT prepare.py."""
        with open(path, "wb") as f:
            for token in tokens:
                # Clip tokens > 65535 to fit uint16 (shouldn't happen with cl100k)
                f.write(struct.pack("<H", min(token, 65535)))

    def get_train_path(self) -> str:
        return str(self.output_dir / "train.bin")

    def get_val_path(self) -> str:
        return str(self.output_dir / "val.bin")
