FROM python:3.12

WORKDIR /app

COPY webapp/backend/requirements.txt webapp/backend/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r webapp/backend/requirements.txt

COPY src ./src
COPY webapp/backend ./webapp/backend
RUN mkdir -p /app/webapp/data

EXPOSE 8000

WORKDIR /app/webapp/backend

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
