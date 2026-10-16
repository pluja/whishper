from ..errors import JobError


class MediaPreparationError(JobError):
    code = "media_preparation_error"

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message, retryable=retryable)


class MediaToolTimeoutError(MediaPreparationError):
    pass
