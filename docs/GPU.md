# NVIDIA GPUs

An NVIDIA GPU transcribes several times faster than a CPU. The CUDA worker is written and built with every release, but it has not been verified on real hardware yet, so treat this page as a path to try rather than a guarantee. Please [report](https://github.com/pluja/anysub/issues/new/choose) what happens, good or bad.

## What you need

- A card of the Volta generation or newer (compute capability 7.0 and up), such as a GTX 16xx, an RTX 20xx to 50xx, or a data-center card from the V100 on. Pascal and older cards, including the GTX 10xx series, cannot run the CUDA image. Use the CPU on those.
- The [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) on the host, and a driver recent enough for CUDA 12.8.
- Docker Engine. The overlay uses Docker GPU reservations, which Podman does not read.

Confirm Docker can reach the GPU before changing anything:

```sh
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
```

## Switch the worker to the GPU

Download the NVIDIA overlay next to `compose.yaml`:

```sh
curl -fsSLO https://github.com/pluja/anysub/releases/latest/download/compose.cuda.yaml
```

Add this line to `.env`, so every `docker compose` command includes the overlay:

```sh
COMPOSE_FILE=compose.yaml:compose.cuda.yaml
```

Then start the stack:

```sh
docker compose up -d
```

The overlay swaps the worker for `ghcr.io/pluja/anysub-worker:<version>-cuda` and gives it every GPU on the host. The CUDA image is about 9 GB, so the first pull takes a while. Models you already downloaded stay in the `model-cache` volume and work on the GPU too.

Keep the worker tag in `compose.cuda.yaml` on the same version as `compose.yaml`. [Upgrading](UPGRADING.md) covers both files.

## Check that the worker found the card

```sh
docker compose logs worker | grep "worker started"
```

The line shows `device=cuda` and the card's name. **Administration > Workers** shows the card as well, and the model picker starts recommending GPU-sized models such as Large v3 Turbo.

When the worker cannot use the GPU, it stops at startup and logs why: the image is the CPU one, the container cannot see a GPU, or the card is too old for the image.

## When the GPU path fails

**`could not select device driver "nvidia"`.** The NVIDIA Container Toolkit is missing, or Docker has not picked it up. Install it, run `sudo nvidia-ctk runtime configure --runtime=docker`, and restart Docker.

**`ANYSUB_DEVICE=cuda, but this worker image was built for CPU`.** The overlay is not in use. Check the `COMPOSE_FILE` line in `.env`, and that `compose.cuda.yaml` sits next to `compose.yaml`.

**`no NVIDIA GPU is visible in the worker container`.** Docker started the worker without the GPU. Run the `nvidia-smi` check above. If it fails too, the problem is in the host setup, not in Anysub.

**The card is too old.** The worker names the card and its compute capability. Remove the `COMPOSE_FILE` line to go back to the CPU.

**Errors that mention `libcudnn` or `libcublas`.** CTranslate2 loads these at runtime from the PyTorch packages inside the image. Check that the running image resolves them:

```sh
docker compose exec worker ldconfig -p | grep -E 'libcudnn|libcublas'
```

No output means the worker runs the CPU image.

**Out of memory.** Choose a smaller model, lower the batch size under **Advanced options** when you transcribe, or choose **Lower memory** under **Administration > Transcription > Precision**.

## Go back to the CPU

Remove the `COMPOSE_FILE` line from `.env` and run `docker compose up -d`.

## AMD and Intel GPUs

Not supported. The speech stack targets CUDA.
