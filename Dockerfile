FROM python:3.11-slim

# 安装git和ssh客户端（这一层会被缓存）
RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制依赖文件，这一层会被缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 再复制应用代码（代码变更不影响上面的层）
COPY . .

# 创建数据目录和ssh配置（合并为单层）
RUN mkdir -p /app/data /root/.ssh && \
    chmod 700 /root/.ssh && \
    echo "Host *\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null" > /root/.ssh/config

EXPOSE 80

CMD ["python", "run.py"]
