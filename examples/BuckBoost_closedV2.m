%% ==========================================
%  GSSAM Buck-Boost Converter – Define, Run, Plot
%  ==========================================
%
%  Everything is simulated inside Simulink (switching + linearized GSSAM
%  + nonlinear GSSAM). This script just defines the parameters and
%  matrices the Simulink model uses, runs the model, and plots.
%
%  Expected logged Simulink signals:
%    IL     : switching inductor current
%    Vc     : switching capacitor voltage
%    X_lin  : 8-element state vector from the LINEARIZED GSSAM block
%    X_nl   : 8-element state vector from the NONLINEAR (d state-dep.) block
%
%  State ordering (both blocks):
%    [iL0, vo0, iLR, iLI, voR, voI, ev_int, ei_int]
%% ==========================================
clear all; clc;

%% ------------------------------------------
% Parameters
%% ------------------------------------------
Vin = 18;            % Input voltage [V]
L   = 150e-6;        % Inductance [H]
C   = 100e-6;        % Capacitance [F]
R   = 10;            % Load resistance [Ohm]
fs  = 40e3;          % Switching frequency [Hz]
Vm  = 1;             % Ramp amplitude [V]
Ts  = 1/fs;
w   = 2*pi*fs;

% Sensor gains
Ks1 = 1;
Ks2 = 1;

% PI1 controller (Voltage loop - outer)
Kp1 = 0.001;  Ki1 = 84.7;
K1  = Kp1;
Tt1 = Kp1/Ki1;

% PI2 controller (Current loop - inner)
Kp2 = 0.00484;   Ki2 = 28.7;
K2  = Kp2;
Tt2 = Kp2/Ki2;

% Reference (set so that d_op = 0.4 by default, vo = Vin*d/(1-d))
d_nom = 0.4;
Vr    = Vin * d_nom / (1 - d_nom);

%% ------------------------------------------
% Operating-point quantities for the LINEARIZED model
%% ------------------------------------------
d_ss = Vr / (Vin + Vr);          % ideal Buck-Boost DC duty
d_ss = max(eps, min(1-eps, d_ss));
sd   = sin(2*pi*d_ss);
cd   = cos(2*pi*d_ss);

a_ss = sd / (2*pi);
b_ss = (cd - 1) / (2*pi);
q0   = 1 - d_ss;

%% ------------------------------------------
% A, B, C, D matrices (Linearized, frozen-d, dX = A*X + B*Vr)
%% ------------------------------------------
A = [ -Kp2*(Vin+Vr)/(L*Vm),         -Kp1*Kp2*(Vin+Vr)/(L*Vm) - q0/L,  0,         0,         2*a_ss/L,   2*b_ss/L,   Ki1*Kp2*(Vin+Vr)/(L*Vm),     Ki2*(Vin+Vr)/(L*Vm);
       Kp2*Vr/(C*R*Vm*q0) + q0/C,    Kp1*Kp2*Vr/(C*R*Vm*q0) - 1/(R*C), -2*a_ss/C, -2*b_ss/C,  0,          0,         -Ki1*Kp2*Vr/(C*R*Vm*q0),      -Ki2*Vr/(C*R*Vm*q0);
       0,                            a_ss/L,                            0,         w,        -q0/L,       0,          0,                            0;
       0,                            b_ss/L,                           -w,         0,         0,         -q0/L,       0,                            0;
      -a_ss/C,                       0,                                 q0/C,      0,        -1/(R*C),    w,          0,                            0;
      -b_ss/C,                       0,                                 0,         q0/C,     -w,         -1/(R*C),    0,                            0;
       0,                           -1,                                 0,         0,         0,          0,          0,                            0;
      -1,                           -Kp1,                               0,         0,         0,          0,          Ki1,                          0  ];

B = [ (Kp1*Kp2*Vr + Vm*q0*d_ss)/(L*Vm*d_ss);
     -Kp1*Kp2*Vr/(C*R*Vm*q0);
      q0*sd / (2*pi*L*d_ss);
      q0*(cd - 1) / (2*pi*L*d_ss);
      0;
      0;
      1;
      Kp1 ];


C = eye(8);
D = zeros(8,1);

fprintf('=== Operating Point ===\n');
fprintf('  d_ss = %.3f\n', d_ss);
fprintf('  Vr   = %.3f V\n', Vr);
fprintf('=== Linearized Closed-Loop A Matrix (8x8) ===\n');
disp(A);
fprintf('=== Linearized Closed-Loop B Vector (8x1) ===\n');
disp(B);

%% ==========================================
%  Run Simulink Model
%% ==========================================
fprintf('\nRunning Simulink model...\n');
model = 'Buck_Boost_2024V';
load_system(model);
simOut = sim(model);
fprintf('Simulink done.\n');

%% ------------------------------------------
% Extract signals from Simulink
%% ------------------------------------------
% Switching (I_S, V_S in your model)
iL_sw = simOut.I_S.Data(:);
vC_sw = simOut.V_S.Data(:);
t_sw  = simOut.I_S.Time(:);

% Linearized GSSAM (8 individual signals X_lin1..X_lin8)
t_lin  = simOut.X_lin1.Time(:);
x1_lin = simOut.X_lin1.Data(:);  x2_lin = simOut.X_lin2.Data(:);
x3_lin = simOut.X_lin3.Data(:);  x4_lin = simOut.X_lin4.Data(:);
x5_lin = simOut.X_lin5.Data(:);  x6_lin = simOut.X_lin6.Data(:);
x7_lin = simOut.X_lin7.Data(:);  x8_lin = simOut.X_lin8.Data(:);

% Nonlinear GSSAM (8 individual signals X_nl1..X_nl8)
t_nl  = simOut.X_nl1.Time(:);
x1_nl = simOut.X_nl1.Data(:);  x2_nl = simOut.X_nl2.Data(:);
x3_nl = simOut.X_nl3.Data(:);  x4_nl = simOut.X_nl4.Data(:);
x5_nl = simOut.X_nl5.Data(:);  x6_nl = simOut.X_nl6.Data(:);
x7_nl = simOut.X_nl7.Data(:);  x8_nl = simOut.X_nl8.Data(:);

%% ------------------------------------------
% Reconstruct full GSSAM signals
%% ------------------------------------------
iL_gssam_lin = x1_lin + 2*x3_lin.*cos(w*t_lin) - 2*x4_lin.*sin(w*t_lin);
Vc_gssam_lin = x2_lin + 2*x5_lin.*cos(w*t_lin) - 2*x6_lin.*sin(w*t_lin);

iL_gssam_nl  = x1_nl  + 2*x3_nl.*cos(w*t_nl)   - 2*x4_nl.*sin(w*t_nl);
Vc_gssam_nl  = x2_nl  + 2*x5_nl.*cos(w*t_nl)   - 2*x6_nl.*sin(w*t_nl);

%% ==========================================
%  Plots
%% ==========================================
t_sw_ms  = t_sw  * 1e3;
t_lin_ms = t_lin * 1e3;
t_nl_ms  = t_nl  * 1e3;

% ---- FIGURE 1: Linearized GSSAM (X1..X8) vs Switching ----
figure('Color','w','Name','Linearized GSSAM vs Switching','Position',[100 80 1000 800]);

subplot(2,1,1)
plot(t_sw_ms, iL_sw, 'b', 'LineWidth', 1.0); hold on;
plot(t_lin_ms, iL_gssam_lin, 'r--', 'LineWidth', 1.2);
plot(t_lin_ms, x1_lin, 'k', 'LineWidth', 1.5);
grid on;
ylabel('i_L (A)')
title('Inductor Current — Linearized GSSAM vs Switching')
legend('Switching','Linearized GSSAM (DC + n=\pm1)','Linearized zero-order')

subplot(2,1,2)
plot(t_sw_ms, vC_sw, 'b', 'LineWidth', 1.0); hold on;
plot(t_lin_ms, Vc_gssam_lin, 'r--', 'LineWidth', 1.2);
plot(t_lin_ms, x2_lin, 'k', 'LineWidth', 1.5);
grid on;
xlabel('Time (ms)')
ylabel('V_C (V)')
title('Output Voltage — Linearized GSSAM vs Switching')
legend('Switching','Linearized GSSAM (DC + n=\pm1)','Linearized zero-order')

% ---- FIGURE 2: Nonlinear GSSAM (X9..X16) vs Switching ----
figure('Color','w','Name','Nonlinear GSSAM (d state-dependent) vs Switching','Position',[150 100 1000 800]);

subplot(2,1,1)
plot(t_sw_ms, iL_sw, 'b', 'LineWidth', 1.0); hold on;
plot(t_nl_ms, iL_gssam_nl, 'r--', 'LineWidth', 1.2);
plot(t_nl_ms, x1_nl, 'k', 'LineWidth', 1.5);
grid on;
ylabel('i_L (A)')
title('Inductor Current — Nonlinear GSSAM (d state-dependent) vs Switching')
legend('Switching','Nonlinear GSSAM (DC + n=\pm1)','Nonlinear zero-order')

subplot(2,1,2)
plot(t_sw_ms, vC_sw, 'b', 'LineWidth', 1.0); hold on;
plot(t_nl_ms, Vc_gssam_nl, 'r--', 'LineWidth', 1.2);
plot(t_nl_ms, x2_nl, 'k', 'LineWidth', 1.5);
grid on;
xlabel('Time (ms)')
ylabel('V_C (V)')
title('Output Voltage — Nonlinear GSSAM (d state-dependent) vs Switching')
legend('Switching','Nonlinear GSSAM (DC + n=\pm1)','Nonlinear zero-order')