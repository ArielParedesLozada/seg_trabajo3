{
  pkgs,
  lib,
  config,
  inputs,
  ...
}: {
  env.name = "seg_trabajo3";

  services = {
    postgres = {
      enable = true;
      package = pkgs.postgresql;
    };
  };
  languages.javascript.enable = true;
}
