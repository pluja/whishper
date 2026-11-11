# NVIDIA GPUs

An NVIDIA GPU transcribes several times faster than a CPU. The GPU worker hasn't been tested on real hardware yet, so please [report](https://github.com/pluja/anysub/issues/new/choose) how it goes, good or bad.

## What you need

- A GTX 16xx, RTX 20xx or newer, or a V100 or newer (compute capability 7.0+). GTX 10xx and older won't work.
- The [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) and a driver that supports CUDA 12.8.
- Docker. Podman isn't supported for the GPU worker.

First check that Docker can see the GPU:

```sh
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
```

## Switch the worker to the GPU

Download the GPU Compose file next to `compose.yaml`:

```sh
curl -fsSLO https://github.com/pluja/anysub/releases/latest/download/compose.cuda.yaml
```

Add this line to `.env`:

```sh
COMPOSE_FILE=compose.yaml:compose.cuda.yaml
```

Then start the stack:

```sh
docker compose up -d
```

The GPU image is about 9 GB, so the first start takes a while. Models you already downloaded still work.

When you [upgrade](UPGRADING.md), update `compose.cuda.yaml` too.

## Check that the worker found the card

```sh
docker compose logs worker | grep "worker started"
```

It should show `device=cuda` and your card's name. **Administration > Workers** shows it too.

If the worker can't use the GPU, it stops and logs why.

## When the GPU path fails

**`could not select device driver "nvidia"`.** The NVIDIA Container Toolkit is missing, or Docker has not picked it up. Install it, run `sudo nvidia-ctk runtime configure --runtime=docker`, and restart Docker.

**`ANYSUB_DEVICE=cuda, but this worker image was built for CPU`.** Check the `COMPOSE_FILE` line in `.env`, and that `compose.cuda.yaml` is next to `compose.yaml`.

**`no NVIDIA GPU is visible in the worker container`.** Run the `nvidia-smi` check above. If that fails too, the problem is the host setup.

**The card is too old.** Remove the `COMPOSE_FILE` line to go back to the CPU.

**Errors that mention `libcudnn` or `libcublas`.** Check that the image has them:

```sh
docker compose exec worker ldconfig -p | grep -E 'libcudnn|libcublas'
```

No output means the worker runs the CPU image.

**Out of memory.** Choose a smaller model, lower the batch size under **Advanced options** when you transcribe, or choose **Lower memory** under **Administration > Transcription > Precision**.

## Go back to the CPU

Remove the `COMPOSE_FILE` line from `.env` and run `docker compose up -d`.

## AMD and Intel GPUs

Not supported.
