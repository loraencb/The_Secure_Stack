FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    bash \
    curl \
    nmap \
    iputils-ping \
    net-tools \
    procps \
    dnsutils \
    && rm -rf /var/lib/apt/lists/*

CMD ["bash"]

