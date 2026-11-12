from pydantic import BaseModel


class DeletedOut(BaseModel):
    documents: int  # document rows removed
    sessions: int  # chat sessions removed (their messages and feedback go with them)
    storage_objects: int  # objects removed from MinIO under users/{user_id}/


class AccountDeletedOut(BaseModel):
    deleted: DeletedOut
