# Build do AutoDep para Windows (.exe)

O AutoDep é uma aplicação desktop (Tauri). O instalador Windows embute **tudo
que é necessário** para rodar nas máquinas do laboratório:

- a interface (Angular) + o binário Tauri;
- a **engine Java** (`engine.jar`);
- um **JRE mínimo** gerado com `jlink` — ou seja, **não é preciso instalar Java**
  nas máquinas do laboratório.

---

## Modos de distribuição (qual usar?)

| Modo | Quem instala | Admin? | Quando usar |
|---|---|---|---|
| **Instalador todos os usuários** (perMachine) | Staff do laboratório | **Sim** | Instalar uma vez por máquina, em `Program Files`. **Recomendado para o lab.** |
| **Instalador por usuário** (currentUser) | O próprio participante | Não | Cada um instala no seu perfil, sem depender do TI. |
| **Portátil (.zip)** | — | Não | Plano B se o instalador for barrado. **Cuidado:** ver aviso abaixo. |

> ⚠️ **Causa do erro no laboratório:** a versão **portátil** só funciona se a
> pasta `resources/` (que contém o `engine.jar` e o `jre/`) ficar **junto** do
> executável. Se alguém copia/extrai **apenas o `.exe`**, o app abre mas falha na
> análise, pois o JRE fica inacessível. Para distribuição em massa, **prefira os
> instaladores** — eles colocam tudo no lugar automaticamente. O app agora exibe
> uma mensagem clara ("Instalação incompleta…") quando isso acontece.

Os dois instaladores embutem **tudo** (interface + `engine.jar` + JRE mínimo via
`jlink`), então **as máquinas não precisam ter Java**.

---

## Como funciona o empacotamento

1. `scripts/prepare-bundle.(sh|ps1)` gera, em `src-tauri/resources/`:
   - `engine.jar` (via `mvn package` no módulo `engine`);
   - `jre/` (runtime Java mínimo via `jlink`).
2. O `tauri.conf.json` declara `resources/**/*`, então esses arquivos vão para
   dentro do app instalado.
3. Em runtime, `src-tauri/src/lib.rs` (`resolve_runtime`) usa o `jre/bin/java` e o
   `engine.jar` empacotados. Em desenvolvimento, recai para o `java` do sistema e
   o JAR de `engine/target/`.

> Importante: o `jlink` produz um JRE para o **sistema operacional onde roda**.
> Para um `.exe` Windows, o `prepare-bundle` precisa rodar **no Windows**
> (máquina local ou CI `windows-latest`).

---

## Opção A — Build pelo GitHub Actions (recomendado, sem máquina Windows)

Há **dois** workflows independentes:

| Workflow | Gera | Artefato(s) |
|---|---|---|
| `build-windows.yml` | Instalador **por usuário** (sem admin) + **portátil** | `autodep-windows-installer`, `autodep-windows-portable` |
| `build-windows-allusers.yml` | Instalador **todos os usuários** (perMachine, com admin) | `autodep-windows-installer-allusers` |

Para o laboratório, rode o **`build-windows-allusers.yml`** (Actions → "Build
Windows (.exe, todos os usuários)" → Run workflow). Para os participantes
instalarem sozinhos sem admin, use o artefato do `build-windows.yml`.

> O instalador "todos os usuários" é produzido aplicando um override de config
> (`src-tauri/tauri.allusers.conf.json`) sobre o `tauri.conf.json` base, via
> `pnpm tauri build --config ...`. O base continua em `currentUser`, então o
> workflow original não muda.

### Detalhe do workflow original (`build-windows.yml`)

1. Faça push do repositório para o GitHub.
2. Vá em **Actions → "Build Windows (.exe)" → Run workflow** (ou crie uma tag
   `vX.Y.Z`).
3. Ao terminar, baixe o artefato **`autodep-windows-installer`** — ele contém o
   instalador `.exe`.

O workflow instala Java 22, Node, pnpm e Rust; roda o `prepare-bundle.ps1`; e
executa `pnpm tauri build`.

---

## Opção B — Build em uma máquina Windows

Pré-requisitos: JDK 22+ (com `jlink`/`jdeps`), Maven, Node 20+, pnpm e Rust
(+ "Microsoft C++ Build Tools").

```powershell
cd app
pnpm install
powershell -ExecutionPolicy Bypass -File scripts\prepare-bundle.ps1

# Instalador por usuário (sem admin) — config base:
pnpm tauri build

# OU instalador para todos os usuários (perMachine, exige admin para instalar):
pnpm tauri build --config src-tauri\tauri.allusers.conf.json
```

O instalador sai em:
`app\src-tauri\target\release\bundle\nsis\AutoDep_<versao>_x64-setup.exe`

---

## Versão portátil (roda de pendrive, sem instalar)

Plano B caso o antivírus do laboratório barre o instalador. É uma pasta com o
`.exe` e os recursos lado a lado — o app resolve o JRE/JAR a partir do próprio
diretório do executável.

- **No CI:** o workflow já gera o artefato **`autodep-windows-portable`**
  (`AutoDep-portable.zip`) automaticamente.
- **Local (Windows), após `prepare-bundle.ps1` + `pnpm tauri build`:**

  ```powershell
  cd app
  powershell -ExecutionPolicy Bypass -File scripts\make-portable.ps1
  ```

  Saída: `app\dist-portable\AutoDep-portable.zip`.

Uso no lab: descompacte o zip em qualquer pasta (ou no pendrive) e execute o
`.exe` que está dentro. **Não precisa instalar nem ter Java.**

> Requer o **WebView2 Runtime**, que já vem pré-instalado no Windows 11 — então
> nas máquinas do laboratório funciona sem nada extra. (Só o instalador NSIS
> consegue baixar o WebView2 automaticamente; a versão portátil depende de ele
> já existir, o que é o caso no Win 11.)

---

## Implantação no laboratório

- Distribua o `.exe` (pendrive, pasta de rede, etc.). A instalação é por usuário,
  sem admin.
- As máquinas **não precisam de Java** — o JRE vai embutido.
- Para o experimento, leve **projetos Java de teste com histórico Git** (a pasta
  `.git` é necessária para a mineração de co-mudanças). Os repositórios em
  `autodep/data/` servem; copie alguns para as máquinas.

---

## Validação local (Linux/macOS) antes do build Windows

Dá para validar a engine sob o JRE mínimo no seu próprio SO:

```bash
cd app
bash scripts/prepare-bundle.sh
src-tauri/resources/jre/bin/java -jar src-tauri/resources/engine.jar /caminho/projeto-java
```

Se sair um JSON e exit code 0, o conjunto de módulos do `jlink` está correto.

---

## Solução de problemas

- **"JAR do motor de análise não encontrado"** no app instalado: o
  `prepare-bundle` não rodou antes do `tauri build`, ou rodou em outro SO.
- **Erro `ClassNotFound`/módulo ausente**: acrescente o módulo faltante à
  variável `Modules`/`MODULES` no `prepare-bundle` e regenere.
- **Antivírus do laboratório bloqueia o `.exe`**: assinar o instalador resolve,
  mas exige certificado pago. Alternativa: liberar o executável na lista do
  antivírus junto ao TI.
