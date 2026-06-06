Esta pasta recebe, no momento do build de release, os artefatos:
  - engine.jar  (gerado por: mvn -f ../../engine package)
  - jre/        (gerado por: jlink, runtime Java minimo)

Eles sao produzidos pelo script scripts/prepare-bundle e NAO sao versionados.
Este arquivo existe apenas para a pasta nao ficar vazia em desenvolvimento.
