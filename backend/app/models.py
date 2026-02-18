# models.py
from sqlalchemy import Column, Integer, String
from database import Base

# simple placeholder table so init_db actually creates something
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
