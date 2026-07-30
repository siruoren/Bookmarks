FROM python:3.11-slim

# 安装git和ssh客户端
RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 创建数据目录和ssh目录
RUN mkdir -p /app/data /root/.ssh && \
    chmod 700 /root/.ssh

# ssh配置：跳过首次主机验证
RUN echo "Host *\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null" > /root/.ssh/config

EXPOSE 80

CMD ["python", "run.py"]
